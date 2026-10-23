import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server.js";
import { prisma } from "../src/db/client.js";
import { LifeOSMcpClient } from "../src/agent/mcpClient.js";
import { TaskPriority, PlanStatus } from "@prisma/client";

const TEST_MCP_INTEG_USER = "test-stage7-mcp-integ";
const TEST_DATE = "2026-10-25";

let serverInstance: http.Server;
let serverPort: number;
let mcpUrl: string;

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_MCP_INTEG_USER },
    update: {},
    create: {
      id: TEST_MCP_INTEG_USER,
      email: "stage7_mcp@lifeos.local",
      name: "Stage 7 MCP Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: TEST_MCP_INTEG_USER },
    update: {
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 50,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
    create: {
      userId: TEST_MCP_INTEG_USER,
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 50,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
  });

  // Start live HTTP server on dynamic port
  await new Promise<void>((resolve) => {
    serverInstance = app.listen(0, "127.0.0.1", () => {
      const addr = serverInstance.address();
      if (addr && typeof addr === "object") {
        serverPort = addr.port;
        mcpUrl = `http://127.0.0.1:${serverPort}/mcp`;
      }
      resolve();
    });
  });
});

test.after(async () => {
  if (serverInstance) {
    await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
  }
  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_MCP_INTEG_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_MCP_INTEG_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_MCP_INTEG_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_MCP_INTEG_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_MCP_INTEG_USER } });
  await prisma.userPreference.deleteMany({ where: { userId: TEST_MCP_INTEG_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_MCP_INTEG_USER } });
  await prisma.$disconnect();
});

test("Integration: Production MCP HTTP endpoint discovery and tool listing via independent HTTP client", async () => {
  // Test independent JSON-RPC client directly against production /mcp route
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.jsonrpc, "2.0");
  assert.ok(data.result?.tools);

  const toolNames = data.result.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes("create_task"));
  assert.ok(toolNames.includes("list_tasks"));
  assert.ok(toolNames.includes("generate_plan"));
  assert.ok(toolNames.includes("approve_plan"));
  assert.ok(toolNames.includes("preview_replan"));
  assert.ok(toolNames.includes("commit_plan"));
  assert.ok(toolNames.includes("get_daily_briefing"));
});

test("Integration: MCP tool calls persist state into PostgreSQL with ActionHistory audit logging", async () => {
  const mcpClient = new LifeOSMcpClient({
    transport: "http",
    serverUrl: mcpUrl,
  });
  await mcpClient.connect();

  try {
    // 1. Call create_task via MCP client
    const createResult = await mcpClient.executeTool({
      id: "call_task_1",
      name: "create_task",
      arguments: {
        userId: TEST_MCP_INTEG_USER,
        title: "Database Integration Audit Task",
        duration: 45,
        priority: "HIGH",
        tags: ["audit", "mcp"],
      },
    });

    assert.equal(createResult.success, true);
    const createdTask = (createResult.data as any).task;
    assert.ok(createdTask.id);
    assert.equal(createdTask.title, "Database Integration Audit Task");

    // Verify task row persisted in PostgreSQL
    const dbTask = await prisma.task.findUnique({
      where: { id: createdTask.id },
    });
    assert.ok(dbTask);
    assert.equal(dbTask.userId, TEST_MCP_INTEG_USER);
    assert.equal(dbTask.duration, 45);
    assert.equal(dbTask.priority, TaskPriority.HIGH);

    // Verify ActionHistory entry was created
    const historyEntry = await prisma.actionHistory.findFirst({
      where: {
        userId: TEST_MCP_INTEG_USER,
        entityType: "TASK",
        entityId: createdTask.id,
        actionType: "CREATE_TASK",
      },
    });
    assert.ok(historyEntry);

    // 2. Call generate_plan via MCP client
    const planResult = await mcpClient.executeTool({
      id: "call_plan_1",
      name: "generate_plan",
      arguments: {
        userId: TEST_MCP_INTEG_USER,
        date: TEST_DATE,
        overwriteApproved: true,
      },
    });

    assert.equal(planResult.success, true);
    const planData = planResult.data as any;
    assert.ok(planData.planId);
    assert.equal(planData.status, "DRAFT");

    // Verify Plan and PlanItem rows in PostgreSQL
    const dbPlan = await prisma.plan.findUnique({
      where: { id: planData.planId },
      include: { items: true },
    });
    assert.ok(dbPlan);
    assert.equal(dbPlan.userId, TEST_MCP_INTEG_USER);
    assert.equal(dbPlan.status, PlanStatus.DRAFT);
    assert.ok(dbPlan.items.length > 0);

    const taskItem = dbPlan.items.find((i) => i.taskId === createdTask.id);
    assert.ok(taskItem, "Task must be scheduled in plan items");

    // 3. Call approve_plan via MCP client
    const approveResult = await mcpClient.executeTool({
      id: "call_approve_1",
      name: "approve_plan",
      arguments: {
        userId: TEST_MCP_INTEG_USER,
        planId: planData.planId,
      },
    });

    assert.equal(approveResult.success, true);

    // Verify plan status transitioned to ACTIVE in PostgreSQL
    const updatedPlan = await prisma.plan.findUnique({
      where: { id: planData.planId },
    });
    assert.equal(updatedPlan?.status, PlanStatus.ACTIVE);
  } finally {
    await mcpClient.close();
  }
});
