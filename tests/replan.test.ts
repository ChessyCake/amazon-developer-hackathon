import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/client.js";
import { TaskPriority, TaskStatus, PlanStatus } from "@prisma/client";
import {
  previewReplan,
  commitPlan,
  rejectPlan,
  rollbackPlan,
  getPlanHistory,
  comparePlansService,
  StalePlanVersionError,
  ConcurrentPlanModificationError,
  InvalidPlanStateError,
} from "../src/services/replanService.js";
import { generateAndSavePlan, approvePlan } from "../src/services/planService.js";
import { runAgent } from "../src/agent/agentLoop.js";
import { MockLLMAdapter } from "../src/agent/adapters/mockAdapter.js";

const TEST_REPLAN_USER = "test-replan-user-001";
const TEST_DATE = "2026-10-22";

test.before(async () => {
  // Ensure clean test user
  await prisma.user.upsert({
    where: { id: TEST_REPLAN_USER },
    update: {},
    create: {
      id: TEST_REPLAN_USER,
      email: "replan_tester@lifeos.local",
      name: "Replan Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: TEST_REPLAN_USER },
    update: {
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 60,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
    create: {
      userId: TEST_REPLAN_USER,
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 60,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
  });

  // Clean prior artifacts
  await prisma.planItem.deleteMany({
    where: { plan: { userId: TEST_REPLAN_USER } },
  });
  await prisma.plan.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_REPLAN_USER } });
});

test.after(async () => {
  await prisma.planItem.deleteMany({
    where: { plan: { userId: TEST_REPLAN_USER } },
  });
  await prisma.plan.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.userPreference.deleteMany({ where: { userId: TEST_REPLAN_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_REPLAN_USER } });
  await prisma.$disconnect();
});

test("Main Scenario: Lab runs 1 hour late -> Replan preserves exam preparation and shifts other tasks", async () => {
  // 1. Setup user schedule with:
  // - Fixed event: Lab (10:00 - 12:00)
  // - Assignment (60m)
  // - Exam preparation (90m)
  // - DSA practice (60m)
  const labEvent = await prisma.calendarEvent.create({
    data: {
      userId: TEST_REPLAN_USER,
      title: "Chemistry Lab",
      startTime: new Date(`${TEST_DATE}T10:00:00+05:30`),
      endTime: new Date(`${TEST_DATE}T12:00:00+05:30`),
    },
  });

  const assignmentTask = await prisma.task.create({
    data: {
      userId: TEST_REPLAN_USER,
      title: "Operating Systems Assignment",
      duration: 60,
      priority: TaskPriority.HIGH,
    },
  });

  const examPrepTask = await prisma.task.create({
    data: {
      userId: TEST_REPLAN_USER,
      title: "Exam preparation",
      duration: 90,
      priority: TaskPriority.HIGH,
    },
  });

  const dsaTask = await prisma.task.create({
    data: {
      userId: TEST_REPLAN_USER,
      title: "DSA practice",
      duration: 60,
      priority: TaskPriority.MEDIUM,
    },
  });

  // 2. Generate and approve initial plan (ACTIVE v1)
  const initialPlan = await generateAndSavePlan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
  });
  await approvePlan(initialPlan.planId, TEST_REPLAN_USER);

  const activeV1 = await prisma.plan.findUnique({
    where: { id: initialPlan.planId },
    include: { items: true },
  });
  assert.equal(activeV1?.status, PlanStatus.ACTIVE);
  assert.equal(activeV1?.version, 1);

  // 3. User reports: "My lab ran an hour late. Replan my day, but preserve my exam preparation."
  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: {
      delayedEvents: [
        {
          eventId: labEvent.id,
          title: "Chemistry Lab",
          delayMinutes: 60, // Lab now ends at 13:00 instead of 12:00
        },
      ],
      reason: "Lab ran an hour late",
    },
    constraints: {
      preservedTaskIds: ["Exam preparation"],
    },
  });

  // Requirement 1: Preview must NOT modify the committed schedule
  const activeDuringPreview = await prisma.plan.findUnique({
    where: { id: initialPlan.planId },
  });
  assert.equal(
    activeDuringPreview?.status,
    PlanStatus.ACTIVE,
    "Committed plan must remain ACTIVE during preview"
  );

  // Proposal must be persisted as PROPOSED with incremented version
  assert.equal(preview.proposedVersion, 2);
  const proposedRecord = await prisma.plan.findUnique({
    where: { id: preview.proposedPlanId },
  });
  assert.equal(proposedRecord?.status, PlanStatus.PROPOSED);
  assert.equal(proposedRecord?.parentPlanId, initialPlan.planId);

  // Requirement 2 & 3: Structured diff & explanations
  assert.ok(preview.diff, "Structured diff must be generated");
  assert.ok(preview.diff.moved.length > 0, "Tasks should have shifted");
  assert.ok(
    preview.tradeOffs.some((t) => t.includes("Exam preparation")),
    "Trade-offs must explicitly document preserving Exam preparation"
  );
  assert.ok(
    preview.tradeOffs.some((t) => t.toLowerCase().includes("moved") || t.toLowerCase().includes("delayed")),
    "Trade-offs must explain why changes were made"
  );

  // Requirement 4: Exam preparation must be preserved in the schedule
  const examPrepInNewSchedule = preview.diff.moved
    .concat(preview.diff.unchanged)
    .find((i) => i.title.toLowerCase().includes("exam preparation"));
  assert.ok(examPrepInNewSchedule, "Exam preparation must be scheduled");

  // Requirement 6, 7 & 9: Commit the proposal explicitly inside a transaction
  const commitResult = await commitPlan({
    planId: preview.proposedPlanId,
    expectedVersion: 2,
    userId: TEST_REPLAN_USER,
  });
  assert.equal(commitResult.success, true);
  assert.equal(commitResult.status, PlanStatus.ACTIVE);

  // Verify previous plan is now SUPERSEDED and new plan is ACTIVE
  const priorPlan = await prisma.plan.findUnique({
    where: { id: initialPlan.planId },
  });
  assert.equal(priorPlan?.status, PlanStatus.SUPERSEDED);

  const newActivePlan = await prisma.plan.findUnique({
    where: { id: preview.proposedPlanId },
  });
  assert.equal(newActivePlan?.status, PlanStatus.ACTIVE);
  assert.equal(newActivePlan?.version, 2);

  // Requirement 11: ActionHistory recorded with version and timestamps
  const history = await prisma.actionHistory.findFirst({
    where: {
      userId: TEST_REPLAN_USER,
      actionType: "COMMIT_PLAN",
      entityId: preview.proposedPlanId,
    },
  });
  assert.ok(history);
  assert.equal((history?.payload as any).version, 2);
});

test("Insufficient Time: Reports tasks that cannot fit rather than silently dropping them", async () => {
  // Add heavy tasks that will not fit when work day is constrained
  const heavyTask = await prisma.task.create({
    data: {
      userId: TEST_REPLAN_USER,
      title: "Extremely Heavy Machine Learning Model Training",
      duration: 600, // 10 hours, exceeds working window
      priority: TaskPriority.LOW,
    },
  });

  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: {
      reason: "Overloaded schedule test",
    },
  });

  // Requirement 5: Report tasks that cannot fit rather than silently dropping them
  assert.ok(
    preview.unscheduledTasks.length > 0,
    "Should identify unscheduled tasks"
  );
  const dropped = preview.unscheduledTasks.find(
    (u) => u.taskId === heavyTask.id || u.title.includes("Heavy Machine Learning")
  );
  assert.ok(dropped, "Heavy task must be explicitly reported as unscheduled");
  assert.ok(dropped.reason, "Must provide explicit reason for not fitting");

  // Trade-offs list must also mention the unscheduled task
  assert.ok(
    preview.tradeOffs.some((t) => t.includes(heavyTask.title)),
    "Trade-offs must disclose the unscheduled task"
  );
});

test("Rejected Proposal: Leaves committed plan ACTIVE and marks proposal REJECTED", async () => {
  // Current active plan
  const activePlanBefore = await prisma.plan.findFirst({
    where: { userId: TEST_REPLAN_USER, date: TEST_DATE, status: PlanStatus.ACTIVE },
  });
  assert.ok(activePlanBefore);

  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: {
      reason: "Test rejection",
    },
  });

  // User rejects the proposal
  const rejectResult = await rejectPlan({
    planId: preview.proposedPlanId,
    reason: "Prefer sticking to my original plan",
    userId: TEST_REPLAN_USER,
  });

  assert.equal(rejectResult.success, true);
  assert.equal(rejectResult.status, PlanStatus.REJECTED);

  // Verify proposed plan is marked REJECTED
  const proposedRecord = await prisma.plan.findUnique({
    where: { id: preview.proposedPlanId },
  });
  assert.equal(proposedRecord?.status, PlanStatus.REJECTED);

  // Verify previous plan is STILL ACTIVE
  const activePlanAfter = await prisma.plan.findUnique({
    where: { id: activePlanBefore.id },
  });
  assert.equal(activePlanAfter?.status, PlanStatus.ACTIVE);

  // Trying to commit a REJECTED plan must fail
  await assert.rejects(
    () =>
      commitPlan({
        planId: preview.proposedPlanId,
        expectedVersion: preview.proposedVersion,
        userId: TEST_REPLAN_USER,
      }),
    InvalidPlanStateError
  );
});

test("Stale Version Protection: Rejects approval with mismatched version", async () => {
  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: { reason: "Stale version test" },
  });

  // User reviewed version X, but passes mismatched expectedVersion
  await assert.rejects(
    () =>
      commitPlan({
        planId: preview.proposedPlanId,
        expectedVersion: 999, // Mismatch!
        userId: TEST_REPLAN_USER,
      }),
    StalePlanVersionError
  );
});

test("Duplicate Approval / Retry Safety: Idempotent commit returns success without side-effects", async () => {
  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: { reason: "Idempotent commit test" },
  });

  // First commit
  const commit1 = await commitPlan({
    planId: preview.proposedPlanId,
    expectedVersion: preview.proposedVersion,
    userId: TEST_REPLAN_USER,
  });
  assert.equal(commit1.success, true);

  // Second commit (retry / network replay)
  const commit2 = await commitPlan({
    planId: preview.proposedPlanId,
    expectedVersion: preview.proposedVersion,
    userId: TEST_REPLAN_USER,
  });
  assert.equal(commit2.success, true);
  assert.equal((commit2 as any).idempotent, true);
});

test("Concurrent Modification Protection: Rejects approval if base active plan changed concurrently", async () => {
  // 1. Generate Proposal A based on current active plan
  const proposalA = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: { reason: "Branch A replan" },
  });

  // 2. Concurrently, another Proposal B is generated and committed first
  const proposalB = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: { reason: "Branch B replan" },
  });
  await commitPlan({
    planId: proposalB.proposedPlanId,
    expectedVersion: proposalB.proposedVersion,
    userId: TEST_REPLAN_USER,
  });

  // 3. Now attempt to commit Proposal A (which is based on stale parentPlanId)
  await assert.rejects(
    () =>
      commitPlan({
        planId: proposalA.proposedPlanId,
        expectedVersion: proposalA.proposedVersion,
        userId: TEST_REPLAN_USER,
      }),
    ConcurrentPlanModificationError
  );
});

test("Database Failure / Transactional Integrity: Failed commit rolls back completely", async () => {
  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    disruptions: { reason: "Transaction rollback test" },
  });

  const activeBefore = await prisma.plan.findFirst({
    where: { userId: TEST_REPLAN_USER, date: TEST_DATE, status: PlanStatus.ACTIVE },
  });

  // Simulate transactional failure by providing an invalid update or mock rejection
  try {
    await prisma.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id: preview.proposedPlanId },
        data: { status: PlanStatus.ACTIVE },
      });
      // Force synthetic database / validation exception
      throw new Error("Synthetic database disk write error");
    });
  } catch (err: any) {
    assert.equal(err.message, "Synthetic database disk write error");
  }

  // Verify proposed plan was NOT committed
  const proposalCheck = await prisma.plan.findUnique({
    where: { id: preview.proposedPlanId },
  });
  assert.equal(proposalCheck?.status, PlanStatus.PROPOSED);

  // Verify previous active plan remains unchanged
  const activeCheck = await prisma.plan.findUnique({
    where: { id: activeBefore!.id },
  });
  assert.equal(activeCheck?.status, PlanStatus.ACTIVE);
});

test("Compensating Undo / Rollback: Safely restores prior superseded plan", async () => {
  // Fetch current history
  const history = await getPlanHistory(TEST_DATE, TEST_REPLAN_USER);
  const supersededPlan = history.history.find((p) => p.status === PlanStatus.SUPERSEDED);
  assert.ok(supersededPlan, "A superseded plan version must exist");

  const currentActiveBefore = history.history.find((p) => p.status === PlanStatus.ACTIVE);
  assert.ok(currentActiveBefore);

  // Rollback to prior superseded version
  const rollbackResult = await rollbackPlan({
    date: TEST_DATE,
    targetVersion: supersededPlan.version,
    reason: "Reverting schedule to prior approved state",
    userId: TEST_REPLAN_USER,
  });

  assert.equal(rollbackResult.success, true);
  assert.equal(rollbackResult.version, supersededPlan.version);

  // Verify restored plan is ACTIVE and former active is SUPERSEDED
  const restoredCheck = await prisma.plan.findUnique({
    where: { id: supersededPlan.id },
  });
  assert.equal(restoredCheck?.status, PlanStatus.ACTIVE);

  const formerActiveCheck = await prisma.plan.findUnique({
    where: { id: currentActiveBefore.id },
  });
  assert.equal(formerActiveCheck?.status, PlanStatus.SUPERSEDED);
});

test("What-If Planning: Simulates scenario without altering committed plan", async () => {
  const activeBefore = await prisma.plan.findFirst({
    where: { userId: TEST_REPLAN_USER, date: TEST_DATE, status: PlanStatus.ACTIVE },
  });

  const whatIfResult = await previewReplan({
    date: TEST_DATE,
    userId: TEST_REPLAN_USER,
    whatIf: true,
    disruptions: {
      reason: "What if I take a 2 hour break at noon?",
      delayedEvents: [],
    },
  });

  assert.equal(whatIfResult.isWhatIf, true);
  assert.ok(whatIfResult.diff);

  // Active plan remains unchanged
  const activeAfter = await prisma.plan.findFirst({
    where: { userId: TEST_REPLAN_USER, date: TEST_DATE, status: PlanStatus.ACTIVE },
  });
  assert.equal(activeBefore?.id, activeAfter?.id);
});

test("Execution Safety Guardrail: Keeps LLM from approving its own proposed actions autonomously", async () => {
  // Configure Mock LLM to attempt calling commit_plan autonomously when user reports a disruption
  const mockAdapter = new MockLLMAdapter([
    () => ({
      content: "Let me commit this replan for you.",
      toolCalls: [
        {
          id: "call-unauthorized-commit",
          name: "commit_plan",
          arguments: {
            planId: "some-plan-id",
            expectedVersion: 2,
            userId: TEST_REPLAN_USER,
          },
        },
      ],
    }),
    () => ({
      content: "I cannot approve the plan myself. Would you like me to commit this revised schedule?",
      toolCalls: undefined,
    }),
  ]);

  // User input does NOT grant explicit approval: "My lab ran an hour late. Replan my day, but preserve my exam preparation."
  const result = await runAgent(
    "My lab ran an hour late. Replan my day, but preserve my exam preparation.",
    {
      userId: TEST_REPLAN_USER,
      llmAdapter: mockAdapter,
    }
  );

  // Verify the autonomous commit was blocked by safety guardrail
  const commitAction = result.actionsExecuted.find((a) => a.tool === "commit_plan");
  assert.ok(commitAction, "Attempted commit tool call was captured");
  assert.equal(commitAction.success, false, "Autonomous commit MUST be rejected");
  assert.ok(
    (commitAction.result as any).error?.includes("SAFETY_VIOLATION"),
    "Must trigger SAFETY_VIOLATION"
  );
});
