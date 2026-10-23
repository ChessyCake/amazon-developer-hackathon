import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../server.js";
import { prisma } from "../src/db/client.js";
import { createTask } from "../src/services/taskService.js";
import { generateAndSavePlan, approvePlan } from "../src/services/planService.js";
import {
  previewReplan,
  commitPlan,
  StalePlanVersionError,
  ConcurrentPlanModificationError,
} from "../src/services/replanService.js";
import { TaskPriority, TaskStatus, PlanStatus } from "@prisma/client";

const TEST_E2E_USER = "test-stage7-e2e-user";
const TEST_DATE = "2026-10-26";

let serverInstance: http.Server;
let serverPort: number;
let baseUrl: string;

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_E2E_USER },
    update: {},
    create: {
      id: TEST_E2E_USER,
      email: "stage7_e2e@lifeos.local",
      name: "Stage 7 E2E Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: TEST_E2E_USER },
    update: {
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 60,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
    create: {
      userId: TEST_E2E_USER,
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 60,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
  });

  await new Promise<void>((resolve) => {
    serverInstance = app.listen(0, "127.0.0.1", () => {
      const addr = serverInstance.address();
      if (addr && typeof addr === "object") {
        serverPort = addr.port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
      }
      resolve();
    });
  });

  // Clean artifacts
  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_E2E_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_E2E_USER } });
});

test.after(async () => {
  if (serverInstance) {
    await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
  }
  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_E2E_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.userPreference.deleteMany({ where: { userId: TEST_E2E_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_E2E_USER } });
  await prisma.$disconnect();
});

// 1. Complete End-to-End Workflow Test
test("E2E: Complete Lifecycle: Task creation -> Plan generation -> Disruption -> Replan preview -> Commit -> DB verification", async () => {
  // 1. Create tasks & fixed event
  const labEvent = await prisma.calendarEvent.create({
    data: {
      userId: TEST_E2E_USER,
      title: "Chemistry Lab",
      startTime: new Date(`${TEST_DATE}T10:00:00+05:30`),
      endTime: new Date(`${TEST_DATE}T12:00:00+05:30`),
    },
  });

  const task1 = await createTask({
    userId: TEST_E2E_USER,
    title: "Operating Systems Assignment",
    duration: 60,
    priority: TaskPriority.HIGH,
  });

  const task2 = await createTask({
    userId: TEST_E2E_USER,
    title: "Exam Preparation",
    duration: 90,
    priority: TaskPriority.HIGH,
  });

  // 2. Generate and approve initial plan (Version 1)
  const initial = await generateAndSavePlan({
    date: TEST_DATE,
    userId: TEST_E2E_USER,
    overwriteApproved: true,
  });
  assert.equal(initial.status, PlanStatus.DRAFT);

  const approved1 = await approvePlan(initial.planId, TEST_E2E_USER);
  assert.equal(approved1.success, true);

  const v1Plan = await prisma.plan.findUnique({
    where: { id: initial.planId },
    include: { items: true },
  });
  assert.equal(v1Plan?.status, PlanStatus.ACTIVE);
  assert.equal(v1Plan?.version, 1);

  // 3. Disruption: Chemistry Lab delayed by 60 minutes
  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_E2E_USER,
    disruptions: {
      delayedEvents: [
        {
          eventId: labEvent.id,
          title: "Chemistry Lab",
          delayMinutes: 60,
        },
      ],
      reason: "Lab ran 1 hour late",
    },
    constraints: {
      preservedTaskIds: [task2.id],
    },
  });

  assert.ok(preview.proposedPlanId);
  assert.equal(preview.proposedVersion, 2);
  assert.equal(preview.baseVersion, 1);
  assert.ok(preview.diff.moved.length > 0, "Tasks must be shifted due to disruption");
  assert.ok(preview.tradeOffs.length > 0);

  // 4. Commit proposed replan
  const commitResult = await commitPlan({
    planId: preview.proposedPlanId,
    expectedVersion: 2,
    userId: TEST_E2E_USER,
  });
  assert.equal(commitResult.success, true);
  assert.equal(commitResult.status, PlanStatus.ACTIVE);

  // 5. Verify PostgreSQL persistence & version integrity
  const v1Final = await prisma.plan.findUnique({ where: { id: initial.planId } });
  assert.equal(v1Final?.status, PlanStatus.SUPERSEDED, "Prior plan must be SUPERSEDED");

  const v2Final = await prisma.plan.findUnique({
    where: { id: preview.proposedPlanId },
    include: { items: true },
  });
  assert.equal(v2Final?.status, PlanStatus.ACTIVE, "Revised plan must be ACTIVE");
  assert.equal(v2Final?.version, 2);
  assert.equal(v2Final?.parentPlanId, initial.planId);

  // 6. Verify ActionHistory audit trail
  const actions = await prisma.actionHistory.findMany({
    where: { userId: TEST_E2E_USER },
    orderBy: { createdAt: "asc" },
  });
  const actionTypes = actions.map((a) => a.actionType);
  assert.ok(actionTypes.includes("CREATE_TASK"));
  assert.ok(actionTypes.includes("GENERATE_PLAN"));
  assert.ok(actionTypes.includes("APPROVE_PLAN"));
  assert.ok(actionTypes.includes("COMMIT_PLAN"));
});

// 2. Failure: Duplicate Requests / Idempotency
test("Failure/Idempotency: Duplicate commitPlan returns success without side-effects", async () => {
  const activePlan = await prisma.plan.findFirst({
    where: { userId: TEST_E2E_USER, status: PlanStatus.ACTIVE },
  });
  assert.ok(activePlan);

  const retryCommit = await commitPlan({
    planId: activePlan.id,
    userId: TEST_E2E_USER,
  });

  assert.equal(retryCommit.success, true);
  assert.equal(retryCommit.idempotent, true);
  assert.equal(retryCommit.status, PlanStatus.ACTIVE);
});

// 3. Failure: Stale Approvals Protection
test("Failure/Stale Approval: Rejects approval when expectedVersion does not match proposal", async () => {
  // Generate candidate preview
  const preview = await previewReplan({
    date: TEST_DATE,
    userId: TEST_E2E_USER,
    disruptions: { reason: "Testing stale version" },
  });

  // Attempt to commit with wrong expectedVersion
  await assert.rejects(
    () =>
      commitPlan({
        planId: preview.proposedPlanId,
        expectedVersion: 999, // Stale version
        userId: TEST_E2E_USER,
      }),
    StalePlanVersionError
  );
});

// 4. Failure: Conflicting Updates / Concurrency Protection
test("Failure/Concurrency: Rejects proposal if active plan changed concurrently", async () => {
  // 1. Create Proposal A based on current active plan
  const proposalA = await previewReplan({
    date: TEST_DATE,
    userId: TEST_E2E_USER,
    disruptions: { reason: "Branch A replan" },
  });

  // 2. Concurrently, another Proposal B is generated and committed first
  const proposalB = await previewReplan({
    date: TEST_DATE,
    userId: TEST_E2E_USER,
    disruptions: { reason: "Branch B replan" },
  });

  await commitPlan({
    planId: proposalB.proposedPlanId,
    expectedVersion: proposalB.proposedVersion,
    userId: TEST_E2E_USER,
  });

  // 3. Attempting to commit prior Proposal A must fail because active plan changed
  await assert.rejects(
    () =>
      commitPlan({
        planId: proposalA.proposedPlanId,
        expectedVersion: proposalA.proposedVersion,
        userId: TEST_E2E_USER,
      }),
    ConcurrentPlanModificationError
  );
});

// 5. Failure: Request Payload Size Limit (413)
test("Failure/Security: Rejects requests exceeding 1MB with HTTP 413", async () => {
  // Build a huge 1.5MB string
  const hugePayload = JSON.stringify({
    title: "Oversized Task",
    description: "X".repeat(1.5 * 1024 * 1024),
  });

  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: hugePayload,
  });

  assert.equal(res.status, 413);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.error, /Payload too large/i);
});
