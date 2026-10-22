import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/client.js";
import { runAgent } from "../src/agent/agentLoop.js";
import { MockLLMAdapter } from "../src/agent/adapters/mockAdapter.js";
import { LLMMessage, LLMResponse } from "../src/agent/types.js";

const TEST_AGENT_USER = "test-agent-user-001";

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_AGENT_USER },
    update: {},
    create: {
      id: TEST_AGENT_USER,
      email: "agent_tester@lifeos.local",
      name: "Agent Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.task.deleteMany({ where: { userId: TEST_AGENT_USER } });
  await prisma.conversationMessage.deleteMany({
    where: { conversation: { userId: TEST_AGENT_USER } },
  });
  await prisma.conversation.deleteMany({ where: { userId: TEST_AGENT_USER } });
});

test.after(async () => {
  await prisma.task.deleteMany({ where: { userId: TEST_AGENT_USER } });
  await prisma.conversationMessage.deleteMany({
    where: { conversation: { userId: TEST_AGENT_USER } },
  });
  await prisma.conversation.deleteMany({ where: { userId: TEST_AGENT_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_AGENT_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_AGENT_USER } });
  await prisma.$disconnect();
});

test("Agent: handles natural-language task creation ('Add an assignment due tomorrow')", async () => {
  // Step 1: LLM receives user message and decides to call create_task
  // Step 2: LLM receives tool result and responds with confirmation
  const mockAdapter = new MockLLMAdapter([
    (_messages) => ({
      content: "I will add that assignment for you.",
      toolCalls: [
        {
          id: "call_create_1",
          name: "create_task",
          arguments: {
            title: "Operating Systems Assignment",
            duration: 60,
            priority: "HIGH",
            deadline: "2026-10-19T18:30:00.000Z",
            tags: ["academic", "assignment"],
          },
        },
      ],
    }),
    (messages) => {
      // Confirm the tool result is present in the conversation
      const lastToolMsg = messages.find((m) => m.role === "tool");
      assert.ok(lastToolMsg);
      const parsed = JSON.parse(lastToolMsg.content || "{}");
      assert.equal(parsed.message, "Task created successfully");

      return {
        content: `I've added 'Operating Systems Assignment' due tomorrow at 6:30 PM (HIGH priority).`,
        toolCalls: undefined,
      };
    },
  ]);

  const result = await runAgent("Add an assignment due tomorrow.", {
    userId: TEST_AGENT_USER,
    llmAdapter: mockAdapter,
    date: "2026-10-18",
  });

  assert.equal(result.completedSuccessfully, true);
  assert.equal(result.actionsExecuted.length, 1);
  assert.equal(result.actionsExecuted[0].tool, "create_task");
  assert.equal(result.actionsExecuted[0].success, true);
  assert.match(result.response, /Operating Systems Assignment/);

  // Verify task was created in DB
  const taskInDb = await prisma.task.findFirst({
    where: { userId: TEST_AGENT_USER, title: "Operating Systems Assignment" },
  });
  assert.ok(taskInDb);
  assert.equal(taskInDb.priority, "HIGH");

  // Verify conversation persistence
  const convMessages = await prisma.conversationMessage.findMany({
    where: { conversationId: result.conversationId },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(convMessages.length >= 3); // user, assistant tool_call, tool, assistant final
});

test("Agent: handles multi-tool request ('What do I need to finish today and plan my day')", async () => {
  // Step 1: Call get_day_context to retrieve workload
  // Step 2: Call generate_plan to create schedule
  // Step 3: Present summary
  const mockAdapter = new MockLLMAdapter([
    () => ({
      content: "Let me check your tasks and schedule.",
      toolCalls: [
        {
          id: "call_context_1",
          name: "get_day_context",
          arguments: { date: "2026-10-18" },
        },
      ],
    }),
    () => ({
      content: "Now generating your daily plan.",
      toolCalls: [
        {
          id: "call_plan_1",
          name: "generate_plan",
          arguments: { date: "2026-10-18" },
        },
      ],
    }),
    (_messages) => ({
      content: "Here is your plan for today with 1 scheduled task and 0 conflicts.",
      toolCalls: undefined,
    }),
  ]);

  const result = await runAgent("What do I need to finish today and plan my day?", {
    userId: TEST_AGENT_USER,
    llmAdapter: mockAdapter,
    date: "2026-10-18",
  });

  assert.equal(result.completedSuccessfully, true);
  assert.equal(result.actionsExecuted.length, 2);
  assert.equal(result.actionsExecuted[0].tool, "get_day_context");
  assert.equal(result.actionsExecuted[1].tool, "generate_plan");
  assert.equal(result.actionsExecuted[1].success, true);
});

test("Agent: handles invalid tool arguments and reports error without crashing", async () => {
  const mockAdapter = new MockLLMAdapter([
    () => ({
      content: "Attempting to create task with invalid duration.",
      toolCalls: [
        {
          id: "call_invalid_1",
          name: "create_task",
          arguments: {
            title: "Impossible Task",
            duration: -50, // Invalid duration!
          },
        },
      ],
    }),
    (messages) => {
      const toolMsg = messages.find((m) => m.role === "tool");
      assert.ok(toolMsg);
      const parsed = JSON.parse(toolMsg.content || "{}");
      assert.equal(parsed.success, false);

      return {
        content: `I couldn't create the task because the duration was invalid: ${parsed.error}`,
        toolCalls: undefined,
      };
    },
  ]);

  const result = await runAgent("Create a task with negative duration", {
    userId: TEST_AGENT_USER,
    llmAdapter: mockAdapter,
  });

  assert.equal(result.completedSuccessfully, true);
  assert.equal(result.actionsExecuted.length, 1);
  assert.equal(result.actionsExecuted[0].success, false);
  assert.match(result.response, /duration/i);
});

test("Agent: enforces bounded execution when model loops tool calls", async () => {
  // Simulates a rogue model that keeps calling list_tasks endlessly
  const infiniteLoopHandler = (): LLMResponse => ({
    content: "Checking tasks again...",
    toolCalls: [
      {
        id: "call_loop",
        name: "list_tasks",
        arguments: {},
      },
    ],
  });

  const mockAdapter = new MockLLMAdapter([
    infiniteLoopHandler,
    infiniteLoopHandler,
    infiniteLoopHandler,
    infiniteLoopHandler,
    infiniteLoopHandler,
  ]);

  const result = await runAgent("Loop indefinitely", {
    userId: TEST_AGENT_USER,
    llmAdapter: mockAdapter,
    maxIterations: 3, // Bound at 3
  });

  assert.equal(result.iterations, 3);
  assert.equal(result.completedSuccessfully, false);
  assert.match(result.response, /maximum allowable steps/i);
});

test("Agent: handles model failure gracefully", async () => {
  const failingAdapter = {
    providerName: "failing-mock",
    async chat(_messages: LLMMessage[]): Promise<LLMResponse> {
      throw new Error("Simulated upstream LLM network failure (503 Service Unavailable)");
    },
  };

  const result = await runAgent("Hello assistant", {
    userId: TEST_AGENT_USER,
    llmAdapter: failingAdapter,
  });

  assert.equal(result.completedSuccessfully, false);
  assert.ok(result.error);
  assert.match(result.response, /503 Service Unavailable/);
});

test("Agent: records activity feed in ActionHistory for UI visibility", async () => {
  const mockAdapter = new MockLLMAdapter([
    () => ({
      content: "Checking preferences.",
      toolCalls: [
        {
          id: "call_pref",
          name: "get_preferences",
          arguments: {},
        },
      ],
    }),
    () => ({
      content: "Retrieved your preferences.",
      toolCalls: undefined,
    }),
  ]);

  await runAgent("Show my preferences", {
    userId: TEST_AGENT_USER,
    llmAdapter: mockAdapter,
  });

  // Check ActionHistory entries
  const history = await prisma.actionHistory.findMany({
    where: {
      userId: TEST_AGENT_USER,
      actionType: "AGENT_TOOL_CALL",
      entityId: "get_preferences",
    },
  });

  assert.ok(history.length > 0);
});
