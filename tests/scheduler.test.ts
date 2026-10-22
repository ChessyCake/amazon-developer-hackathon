import test from "node:test";
import assert from "node:assert/strict";
import { TaskPriority, TaskStatus, PlanItemType, PlanStatus } from "@prisma/client";
import { scheduleDay } from "../src/planner/scheduler.js";
import { PlannerInput } from "../src/planner/types.js";
import { getWorkWindow, mergeBusyIntervals, calculateFreeSlots } from "../src/planner/intervals.js";
import { prisma } from "../src/db/client.js";
import { generateAndSavePlan, ApprovedPlanExistsError, approvePlan } from "../src/services/planService.js";

const DEFAULT_PREFS = {
  focusMinutes: 45,
  breakMinutes: 10,
  workStartTime: "09:00",
  workEndTime: "18:00",
  bufferMinutes: 5,
  timezone: "Asia/Kolkata",
};

test("Intervals: getWorkWindow accurately calculates UTC window for Asia/Kolkata (+05:30)", () => {
  // 09:00 IST = 03:30 UTC
  // 18:00 IST = 12:30 UTC
  const window = getWorkWindow("2026-10-18", DEFAULT_PREFS);

  assert.equal(window.totalMinutes, 540); // 9 hours = 540m
  assert.equal(window.start.toISOString(), "2026-10-18T03:30:00.000Z");
  assert.equal(window.end.toISOString(), "2026-10-18T12:30:00.000Z");
});

test("Intervals: mergeBusyIntervals merges overlapping events and applies buffers", () => {
  const window = getWorkWindow("2026-10-18", DEFAULT_PREFS);
  const events = [
    {
      id: "e1",
      title: "Team Standup",
      startTime: new Date("2026-10-18T04:30:00.000Z"), // 10:00 IST
      endTime: new Date("2026-10-18T05:00:00.000Z"),   // 10:30 IST
    },
    {
      id: "e2",
      title: "Overlapping Sync",
      startTime: new Date("2026-10-18T04:50:00.000Z"), // 10:20 IST
      endTime: new Date("2026-10-18T05:30:00.000Z"),   // 11:00 IST
    },
  ];

  const merged = mergeBusyIntervals(events, window.start, window.end, 5);
  // e1: 04:25 to 05:05
  // e2: 04:45 to 05:35
  // Overlap -> merged into 04:25 to 05:35
  assert.equal(merged.length, 1);
  assert.equal(merged[0].start.toISOString(), "2026-10-18T04:25:00.000Z");
  assert.equal(merged[0].end.toISOString(), "2026-10-18T05:35:00.000Z");
});

test("Scheduler: schedules tasks around fixed events deterministically", () => {
  const input: PlannerInput = {
    date: "2026-10-18",
    preferences: DEFAULT_PREFS,
    fixedEvents: [
      {
        id: "evt-1",
        title: "All Hands Meeting",
        startTime: "2026-10-18T04:30:00.000Z", // 10:00 - 11:00 IST
        endTime: "2026-10-18T05:30:00.000Z",
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "High Priority Task",
        duration: 60,
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
      },
      {
        id: "task-2",
        title: "Medium Priority Task",
        duration: 30,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
      },
    ],
  };

  const result1 = scheduleDay(input);
  const result2 = scheduleDay(input);

  // Determinism check: identical results for identical inputs
  assert.deepEqual(result1.scheduledItems, result2.scheduledItems);
  assert.equal(result1.isFeasible, true);
  assert.equal(result1.validation.passed, true);
  assert.equal(result1.validation.errors.length, 0);

  // High priority task should be scheduled first
  const highTaskItem = result1.scheduledItems.find((i) => i.taskId === "task-1");
  assert.ok(highTaskItem);
  assert.equal(highTaskItem.durationMinutes, 60);
});

test("Scheduler: respects task dependencies (prerequisite completes before dependent starts)", () => {
  const input: PlannerInput = {
    date: "2026-10-18",
    preferences: DEFAULT_PREFS,
    fixedEvents: [],
    tasks: [
      {
        id: "task-backend",
        title: "Build Backend API",
        duration: 60,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
      },
      {
        id: "task-frontend",
        title: "Build Frontend UI",
        duration: 60,
        priority: TaskPriority.URGENT, // Higher priority but depends on backend!
        status: TaskStatus.PENDING,
        dependencies: ["task-backend"],
      },
    ],
  };

  const result = scheduleDay(input);
  assert.equal(result.validation.passed, true);

  const backendItem = result.scheduledItems.find((i) => i.taskId === "task-backend");
  const frontendItem = result.scheduledItems.find((i) => i.taskId === "task-frontend");

  assert.ok(backendItem);
  assert.ok(frontendItem);
  assert.ok(
    backendItem.endTime.getTime() <= frontendItem.startTime.getTime(),
    "Backend must finish before frontend starts"
  );
});

test("Scheduler: detects impossible deadlines and reports explicit reason", () => {
  const input: PlannerInput = {
    date: "2026-10-18",
    preferences: DEFAULT_PREFS,
    fixedEvents: [],
    tasks: [
      {
        id: "task-impossible",
        title: "Submit Yesterday Paper",
        duration: 30,
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-10-18T02:00:00.000Z"), // 07:30 IST, before 09:00 IST start!
      },
    ],
  };

  const result = scheduleDay(input);
  assert.equal(result.unscheduledTasks.length, 1);
  assert.equal(result.unscheduledTasks[0].taskId, "task-impossible");
  assert.match(result.unscheduledTasks[0].reason, /Deadline.*passed before start of work window/i);
});

test("Scheduler: reports insufficient time when tasks exceed remaining hours", () => {
  const input: PlannerInput = {
    date: "2026-10-18",
    preferences: {
      ...DEFAULT_PREFS,
      workStartTime: "09:00",
      workEndTime: "11:00", // Only 120 minutes total!
    },
    fixedEvents: [],
    tasks: [
      {
        id: "task-huge-1",
        title: "Major Refactor",
        duration: 100,
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
      },
      {
        id: "task-huge-2",
        title: "Another Big Task",
        duration: 90, // Won't fit!
        priority: TaskPriority.LOW,
        status: TaskStatus.PENDING,
      },
    ],
  };

  const result = scheduleDay(input);
  assert.equal(result.unscheduledTasks.length, 1);
  assert.equal(result.unscheduledTasks[0].taskId, "task-huge-2");
  assert.match(result.unscheduledTasks[0].reason, /Requires 90m continuous time/i);
});

test("Scheduler: supports task splitting across focus intervals without duration loss", () => {
  const input: PlannerInput = {
    date: "2026-10-18",
    preferences: {
      ...DEFAULT_PREFS,
      focusMinutes: 45,
      breakMinutes: 10,
    },
    fixedEvents: [],
    tasks: [
      {
        id: "task-long",
        title: "Deep Research Project",
        duration: 90, // 90 minutes with allowSplitting=true
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        allowSplitting: true,
      },
    ],
  };

  const result = scheduleDay(input);
  assert.equal(result.isFeasible, true);
  assert.equal(result.validation.passed, true);

  const parts = result.scheduledItems.filter((i) => i.taskId === "task-long");
  assert.equal(parts.length, 2, "Should be split into 2 parts of 45m each");
  assert.equal(parts[0].durationMinutes, 45);
  assert.equal(parts[1].durationMinutes, 45);

  // Verify break inserted between parts
  const breakItem = result.scheduledItems.find((i) => i.itemType === PlanItemType.BREAK);
  assert.ok(breakItem, "Break should be inserted between focus sessions");
  assert.equal(breakItem.durationMinutes, 10);
});

test("Scheduler: excludes completed tasks from scheduling", () => {
  const input: PlannerInput = {
    date: "2026-10-18",
    preferences: DEFAULT_PREFS,
    fixedEvents: [],
    tasks: [
      {
        id: "task-done",
        title: "Already Finished Task",
        duration: 30,
        priority: TaskPriority.HIGH,
        status: TaskStatus.COMPLETED,
      },
      {
        id: "task-pending",
        title: "Active Task",
        duration: 30,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
      },
    ],
  };

  const result = scheduleDay(input);
  assert.ok(!result.scheduledItems.some((i) => i.taskId === "task-done"));
  assert.ok(result.scheduledItems.some((i) => i.taskId === "task-pending"));
});

test("Plan Service: refuses to silently overwrite approved (ACTIVE) plan", async () => {
  const TEST_PLAN_USER = "test-plan-user-001";
  await prisma.user.upsert({
    where: { id: TEST_PLAN_USER },
    update: {},
    create: {
      id: TEST_PLAN_USER,
      email: "plan_test@lifeos.local",
      name: "Plan Tester",
      timezone: "Asia/Kolkata",
    },
  });

  // Generate initial draft
  const draft = await generateAndSavePlan({
    date: "2026-10-25",
    userId: TEST_PLAN_USER,
  });
  assert.equal(draft.status, PlanStatus.DRAFT);

  // Approve plan -> transitions to ACTIVE
  await approvePlan(draft.planId, TEST_PLAN_USER);

  // Attempting to generate again without overwriteApproved must throw ApprovedPlanExistsError
  await assert.rejects(
    async () => {
      await generateAndSavePlan({
        date: "2026-10-25",
        userId: TEST_PLAN_USER,
        overwriteApproved: false,
      });
    },
    (err: Error) => err instanceof ApprovedPlanExistsError
  );

  // Passing overwriteApproved: true must succeed
  const forced = await generateAndSavePlan({
    date: "2026-10-25",
    userId: TEST_PLAN_USER,
    overwriteApproved: true,
  });
  assert.ok(forced.planId);

  // Cleanup
  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_PLAN_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_PLAN_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_PLAN_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_PLAN_USER } });
});
