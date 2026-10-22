import test from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../src/tools/register.js";
import { prisma } from "../src/db/client.js";

const TEST_MCP_USER = "test-mcp-user-001";

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_MCP_USER },
    update: {},
    create: {
      id: TEST_MCP_USER,
      email: "mcp_tool_test@lifeos.local",
      name: "MCP Tester",
      timezone: "Asia/Kolkata",
    },
  });
  await prisma.task.deleteMany({ where: { userId: TEST_MCP_USER } });
});

test.after(async () => {
  await prisma.task.deleteMany({ where: { userId: TEST_MCP_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_MCP_USER } });
  await prisma.$disconnect();
});

test("McpServer registers all LifeOS tools (Stage 1, 2, 4)", async () => {
  const server = new McpServer({ name: "lifeos-test", version: "0.1.0" });
  registerAllTools(server);

  // Verify that registering all tools succeeds and all 17 tools are present
  assert.ok(server);
  const toolKeys = Object.keys((server as any)._registeredTools || {});
  const expectedTools = [
    "create_task",
    "list_tasks",
    "update_task",
    "complete_task",
    "delete_task",
    "get_preferences",
    "update_preferences",
    "get_day_context",
    "generate_plan",
    "get_plan",
    "approve_plan",
    "preview_replan",
    "compare_plans",
    "commit_plan",
    "reject_plan",
    "get_plan_history",
    "rollback_plan",
  ];
  for (const expected of expectedTools) {
    assert.ok(
      toolKeys.includes(expected),
      `Expected MCP tool '${expected}' to be registered`
    );
  }
});

test("get_day_context tool returns compliant contract for date", async () => {
  const { getDayContext } = await import("../src/services/contextService.js");
  const result = await getDayContext("2026-10-18", TEST_MCP_USER);

  assert.equal(result.date, "2026-10-18");
  assert.equal(result.timezone, "Asia/Kolkata");
  assert.ok(Array.isArray(result.fixedEvents));
  assert.ok(Array.isArray(result.pendingTasks));
  assert.ok(result.preferences);
  assert.equal(typeof result.preferences.focusMinutes, "number");
  assert.equal(typeof result.preferences.breakMinutes, "number");
});
