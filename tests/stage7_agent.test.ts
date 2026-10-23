import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/client.js";
import { runAgent } from "../src/agent/agentLoop.js";
import { MockLLMAdapter } from "../src/agent/adapters/mockAdapter.js";
import { LLMAdapter } from "../src/agent/adapters/base.js";
import { LLMMessage, LLMResponse, LLMToolDefinition } from "../src/agent/types.js";

const TEST_STAGE7_AGENT_USER = "test-stage7-agent-user";
const TEST_VICTIM_USER = "test-stage7-victim-user";
const TEST_DATE = "2026-10-25";

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_STAGE7_AGENT_USER },
    update: {},
    create: {
      id: TEST_STAGE7_AGENT_USER,
      email: "stage7_agent@lifeos.local",
      name: "Stage 7 Agent Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.user.upsert({
    where: { id: TEST_VICTIM_USER },
    update: {},
    create: {
      id: TEST_VICTIM_USER,
      email: "victim@lifeos.local",
      name: "Victim User",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.task.deleteMany({
    where: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } },
  });
  await prisma.conversationMessage.deleteMany({
    where: { conversation: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } } },
  });
  await prisma.conversation.deleteMany({
    where: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } },
  });
});

test.after(async () => {
  await prisma.task.deleteMany({
    where: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } },
  });
  await prisma.conversationMessage.deleteMany({
    where: { conversation: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } } },
  });
  await prisma.conversation.deleteMany({
    where: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } },
  });
  await prisma.actionHistory.deleteMany({
    where: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } },
  });
  await prisma.userPreference.deleteMany({
    where: { userId: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [TEST_STAGE7_AGENT_USER, TEST_VICTIM_USER] } },
  });
  await prisma.$disconnect();
});

// 1. Tool Selection
test("Agent: Correctly selects tool based on user intent and completes workflow", async () => {
  const mockAdapter = new MockLLMAdapter([
    (_messages) => ({
      content: "Checking your current briefing.",
      toolCalls: [
        {
          id: "call_briefing_1",
          name: "get_daily_briefing",
          arguments: {
            date: TEST_DATE,
          },
        },
      ],
    }),
    (messages) => {
      const toolMsg = messages.find((m) => m.role === "tool");
      assert.ok(toolMsg);
      return {
        content: "Here is your morning briefing for today.",
        toolCalls: undefined,
      };
    },
  ]);

  const result = await runAgent("Give me my daily briefing for today.", {
    userId: TEST_STAGE7_AGENT_USER,
    llmAdapter: mockAdapter,
    date: TEST_DATE,
  });

  assert.equal(result.completedSuccessfully, true);
  assert.equal(result.actionsExecuted.length, 1);
  assert.equal(result.actionsExecuted[0].tool, "get_daily_briefing");
  assert.equal(result.actionsExecuted[0].success, true);
});

// 2. Malformed Tool Arguments
test("Agent: Handles malformed arguments from LLM gracefully without crashing loop", async () => {
  const mockAdapter = new MockLLMAdapter([
    (_messages) => ({
      content: "Creating task with missing title.",
      toolCalls: [
        {
          id: "call_bad_arg_1",
          name: "create_task",
          arguments: {
            duration: -50, // invalid negative duration and missing title
          },
        },
      ],
    }),
    (messages) => {
      const toolMsg = messages.find((m) => m.role === "tool");
      assert.ok(toolMsg);
      const data = JSON.parse(toolMsg.content || "{}");
      assert.ok(data.error, "Tool should report validation error");

      return {
        content: `I could not create the task because the parameters were invalid: ${data.error}`,
        toolCalls: undefined,
      };
    },
  ]);

  const result = await runAgent("Create a task with bad args", {
    userId: TEST_STAGE7_AGENT_USER,
    llmAdapter: mockAdapter,
    date: TEST_DATE,
  });

  assert.equal(result.completedSuccessfully, true);
  assert.equal(result.actionsExecuted.length, 1);
  assert.equal(result.actionsExecuted[0].success, false);
  assert.match(result.response, /invalid/i);
});

// 3. Model Provider Failure
test("Agent: Gracefully handles model-provider failure (network drop/500) without crashing", async () => {
  const failingAdapter: LLMAdapter = {
    chat: async () => {
      throw new Error("HTTP 503: Model provider service temporarily unavailable");
    },
  };

  const result = await runAgent("Hello assistant", {
    userId: TEST_STAGE7_AGENT_USER,
    llmAdapter: failingAdapter,
    date: TEST_DATE,
  });

  assert.equal(result.completedSuccessfully, false);
  assert.ok(result.error);
  assert.match(result.error, /HTTP 503/);
  assert.match(result.response, /temporarily unavailable/);
});

// 4. Security: Prompt Injection / UserId Spoofing Protection
test("Agent Security: Neutralizes injected spoofed userId in tool call arguments", async () => {
  const spoofAttemptAdapter = new MockLLMAdapter([
    (_messages) => ({
      content: "Executing injected command to create task for another user.",
      toolCalls: [
        {
          id: "call_inject_1",
          name: "create_task",
          arguments: {
            userId: TEST_VICTIM_USER, // Spoofed user ID!
            title: "Injected Malicious Task",
            duration: 30,
          },
        },
      ],
    }),
    (_messages) => ({
      content: "Task created.",
      toolCalls: undefined,
    }),
  ]);

  const result = await runAgent("Add a task", {
    userId: TEST_STAGE7_AGENT_USER,
    llmAdapter: spoofAttemptAdapter,
    date: TEST_DATE,
  });

  assert.equal(result.completedSuccessfully, true);

  // Verify task was NOT created for victim user
  const victimTask = await prisma.task.findFirst({
    where: { userId: TEST_VICTIM_USER, title: "Injected Malicious Task" },
  });
  assert.equal(victimTask, null, "Injected userId must NOT affect victim account");

  // Verify task was created strictly for authorized user
  const authorizedTask = await prisma.task.findFirst({
    where: { userId: TEST_STAGE7_AGENT_USER, title: "Injected Malicious Task" },
  });
  assert.ok(authorizedTask, "Task must be safely bound to authorized user");
});

// 5. Security: Autonomous Approval Guardrail with Negation
test("Agent Security: Blocks autonomous plan approval when user message expresses negation", async () => {
  const eagerAdapter = new MockLLMAdapter([
    (_messages) => ({
      content: "Committing the plan immediately.",
      toolCalls: [
        {
          id: "call_commit_1",
          name: "commit_plan",
          arguments: {
            planId: "dummy-plan-id",
          },
        },
      ],
    }),
    (messages) => {
      const toolMsg = messages.find((m) => m.role === "tool");
      assert.ok(toolMsg);
      const data = JSON.parse(toolMsg.content || "{}");
      assert.match(data.error, /SAFETY_VIOLATION/);

      return {
        content: "I cannot commit the plan without your explicit confirmation.",
        toolCalls: undefined,
      };
    },
  ]);

  // Negative user intent: contains negation words like "don't" / "not yet"
  const result = await runAgent("Please do NOT commit the plan yet, show me the preview first.", {
    userId: TEST_STAGE7_AGENT_USER,
    llmAdapter: eagerAdapter,
    date: TEST_DATE,
  });

  assert.equal(result.completedSuccessfully, true);
  assert.equal(result.actionsExecuted[0].tool, "commit_plan");
  assert.equal(result.actionsExecuted[0].success, false);
  assert.match((result.actionsExecuted[0].result as any).error, /SAFETY_VIOLATION/);
});
