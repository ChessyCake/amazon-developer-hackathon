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

test("McpServer registers all LifeOS tools (Stage 1 & Stage 2)", async () => {
  const server = new McpServer({ name: "lifeos-test", version: "0.1.0" });
  registerAllTools(server);

  // Verify that registering all tools succeeds without error
  assert.ok(server);
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
