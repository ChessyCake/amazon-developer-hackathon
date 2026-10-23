import test from "node:test";
import assert from "node:assert/strict";
import { createTask, updateTask } from "../src/services/taskService.js";
import { getWorkWindow, mergeBusyIntervals, calculateFreeSlots } from "../src/planner/intervals.js";
import { scheduleDay } from "../src/planner/scheduler.js";
import { comparePlans } from "../src/planner/comparator.js";
import { PlannerInput, PlannerTask, PlannerEvent } from "../src/planner/types.js";
import { updatePreferences } from "../src/services/preferenceService.js";
import { prisma } from "../src/db/client.js";
import { TaskPriority, TaskStatus, PlanItemType } from "@prisma/client";

const TEST_UNIT_USER = "test-stage7-unit-user";

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_UNIT_USER },
    update: {},
    create: {
      id: TEST_UNIT_USER,
      email: "stage7_unit@lifeos.local",
      name: "Stage 7 Unit Tester",
      timezone: "Asia/Kolkata",
    },
  });
  await prisma.task.deleteMany({ where: { userId: TEST_UNIT_USER } });
});

test.after(async () => {
  await prisma.task.deleteMany({ where: { userId: TEST_UNIT_USER } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_UNIT_USER } });
  await prisma.userPreference.deleteMany({ where: { userId: TEST_UNIT_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_UNIT_USER } });
  await prisma.$disconnect();
});

// 1. Task Validation Tests
test("Unit: Task Validation rejects missing, empty, or whitespace-only titles", async () => {
  await assert.rejects(
    () => createTask({ userId: TEST_UNIT_USER, title: "" }),
    /Task title is required/
  );

  await assert.rejects(
    () => createTask({ userId: TEST_UNIT_USER, title: "    " }),
    /Task title is required/
  );

  await assert.rejects(
    () => createTask({ userId: TEST_UNIT_USER, title: null as any }),
    /Task title is required/
  );
});

test("Unit: Task Validation enforces positive duration and reasonable upper bounds", async () => {
  await assert.rejects(
    () => createTask({ userId: TEST_UNIT_USER, title: "Zero Duration", duration: 0 }),
    /Task duration must be a positive integer/
  );

  await assert.rejects(
    () => createTask({ userId: TEST_UNIT_USER, title: "Negative Duration", duration: -30 }),
    /Task duration must be a positive integer/
  );

  await assert.rejects(
    () => createTask({ userId: TEST_UNIT_USER, title: "Excessive Duration", duration: 2000 }),
    /Task duration must be a positive integer between 1 and 1440/
  );
});

test("Unit: Task Validation rejects invalid deadline formats", async () => {
  await assert.rejects(
    () => createTask({ userId: TEST_UNIT_USER, title: "Invalid Deadline", deadline: "not-a-date" }),
    /Invalid deadline format/
  );
});

// 2. Scheduling Intervals & Boundary Tests
test("Unit: Scheduling Intervals handles multiple timezones accurately across date boundaries", () => {
  // Asia/Kolkata (+05:30): 09:00 - 17:00 IST -> 03:30 - 11:30 UTC
  const kolkataWindow = getWorkWindow("2026-10-24", {
    workStartTime: "09:00",
    workEndTime: "17:00",
    focusMinutes: 50,
    breakMinutes: 10,
    bufferMinutes: 5,
    timezone: "Asia/Kolkata",
  });
  assert.equal(kolkataWindow.totalMinutes, 480);
  assert.equal(kolkataWindow.start.toISOString(), "2026-10-24T03:30:00.000Z");
  assert.equal(kolkataWindow.end.toISOString(), "2026-10-24T11:30:00.000Z");

  // America/New_York (EDT in Oct is UTC-4): 09:00 - 17:00 EDT -> 13:00 - 21:00 UTC
  const nyWindow = getWorkWindow("2026-10-24", {
    workStartTime: "09:00",
    workEndTime: "17:00",
    focusMinutes: 50,
    breakMinutes: 10,
    bufferMinutes: 5,
    timezone: "America/New_York",
  });
  assert.equal(nyWindow.totalMinutes, 480);
  assert.equal(nyWindow.start.toISOString(), "2026-10-24T13:00:00.000Z");
  assert.equal(nyWindow.end.toISOString(), "2026-10-24T21:00:00.000Z");
});

test("Unit: Preferences validation rejects workStartTime >= workEndTime", async () => {
  await assert.rejects(
    () =>
      updatePreferences({
        userId: TEST_UNIT_USER,
        workStartTime: "18:00",
        workEndTime: "09:00",
      }),
    /workStartTime must be earlier than workEndTime/
  );

  await assert.rejects(
    () =>
      updatePreferences({
        userId: TEST_UNIT_USER,
        workStartTime: "10:00",
        workEndTime: "10:00",
      }),
    /workStartTime must be earlier than workEndTime/
  );
});

test("Unit: Scheduling Intervals merges chained and overlapping busy blocks with buffers", () => {
  const windowStart = new Date("2026-10-24T09:00:00.000Z");
  const windowEnd = new Date("2026-10-24T18:00:00.000Z");

  const events: PlannerEvent[] = [
    {
      id: "ev-1",
      title: "Morning Standup",
      startTime: "2026-10-24T10:00:00.000Z",
      endTime: "2026-10-24T10:30:00.000Z",
    },
    {
      id: "ev-2",
      title: "Sprint Planning",
      startTime: "2026-10-24T10:25:00.000Z", // overlaps with standup
      endTime: "2026-10-24T11:30:00.000Z",
    },
    {
      id: "ev-3",
      title: "Client Sync",
      startTime: "2026-10-24T14:00:00.000Z",
      endTime: "2026-10-24T15:00:00.000Z",
    },
  ];

  // With 5-minute buffer:
  // ev-1: 09:55 - 10:35
  // ev-2: 10:20 - 11:35
  // -> merged: 09:55 - 11:35
  // ev-3: 13:55 - 15:05
  const merged = mergeBusyIntervals(events, windowStart, windowEnd, 5);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].start.toISOString(), "2026-10-24T09:55:00.000Z");
  assert.equal(merged[0].end.toISOString(), "2026-10-24T11:35:00.000Z");
  assert.equal(merged[1].start.toISOString(), "2026-10-24T13:55:00.000Z");
  assert.equal(merged[1].end.toISOString(), "2026-10-24T15:05:00.000Z");

  const freeSlots = calculateFreeSlots(windowStart, windowEnd, merged);
  // Free slots:
  // 1) 09:00 - 09:55 (55 min)
  // 2) 11:35 - 13:55 (140 min)
  // 3) 15:05 - 18:00 (175 min)
  assert.equal(freeSlots.length, 3);
  assert.equal(freeSlots[0].durationMinutes, 55);
  assert.equal(freeSlots[1].durationMinutes, 140);
  assert.equal(freeSlots[2].durationMinutes, 175);
});

// 3. Deadline Checks
test("Unit: Deadline checks detects missed deadlines and respects boundary compliance", () => {
  const prefs = {
    workStartTime: "09:00",
    workEndTime: "12:00",
    focusMinutes: 60,
    breakMinutes: 0,
    bufferMinutes: 0,
    timezone: "UTC",
  };

  // 1. Task that finishes past deadline
  const inputMissed: PlannerInput = {
    date: "2026-10-24",
    preferences: prefs,
    fixedEvents: [],
    tasks: [
      {
        id: "task-tight",
        title: "Overdue Delivery",
        duration: 120, // 2 hours: 09:00 - 11:00
        priority: TaskPriority.HIGH,
        deadline: new Date("2026-10-24T10:00:00.000Z"), // deadline is 10:00 UTC (cannot finish in 1h)
        status: TaskStatus.PENDING,
      },
    ],
  };

  const resultMissed = scheduleDay(inputMissed);
  assert.equal(resultMissed.isFeasible, false);
  assert.ok(resultMissed.unscheduledTasks.some((u) => u.taskId === "task-tight"));
  assert.match(resultMissed.unscheduledTasks[0].reason, /deadline/i);

  // 2. Task that completes exactly on or before deadline
  const inputOnTime: PlannerInput = {
    date: "2026-10-24",
    preferences: prefs,
    fixedEvents: [],
    tasks: [
      {
        id: "task-ontime",
        title: "Punctual Delivery",
        duration: 60, // 09:00 - 10:00
        priority: TaskPriority.HIGH,
        deadline: new Date("2026-10-24T10:00:00.000Z"), // exactly finishes at 10:00
        status: TaskStatus.PENDING,
      },
    ],
  };

  const resultOnTime = scheduleDay(inputOnTime);
  assert.equal(resultOnTime.isFeasible, true);
  assert.equal(resultOnTime.unscheduledTasks.length, 0);
  const scheduledItem = resultOnTime.scheduledItems.find((i) => i.taskId === "task-ontime");
  assert.ok(scheduledItem);
  assert.ok(scheduledItem.endTime.getTime() <= new Date("2026-10-24T10:00:00.000Z").getTime());
});

// 4. Plan Comparisons
test("Unit: Plan comparisons calculates exact diffs for moved, added, and removed items", () => {
  const baseItems = [
    {
      id: "item-1",
      itemType: PlanItemType.TASK,
      title: "Write Specs",
      startTime: new Date("2026-10-24T09:00:00.000Z"),
      endTime: new Date("2026-10-24T10:00:00.000Z"),
      order: 1,
      taskId: "t-1",
    },
    {
      id: "item-2",
      itemType: PlanItemType.TASK,
      title: "Review PRs",
      startTime: new Date("2026-10-24T10:00:00.000Z"),
      endTime: new Date("2026-10-24T11:00:00.000Z"),
      order: 2,
      taskId: "t-2",
    },
  ];

  const revisedItems = [
    // item-1 shifted by 30 mins
    {
      itemType: PlanItemType.TASK,
      title: "Write Specs",
      startTime: new Date("2026-10-24T09:30:00.000Z"),
      endTime: new Date("2026-10-24T10:30:00.000Z"),
      order: 1,
      taskId: "t-1",
    },
    // new task added
    {
      itemType: PlanItemType.TASK,
      title: "Security Triage",
      startTime: new Date("2026-10-24T10:30:00.000Z"),
      endTime: new Date("2026-10-24T11:00:00.000Z"),
      order: 2,
      taskId: "t-3",
    },
    // t-2 removed / unscheduled
  ];

  const diff = comparePlans(baseItems, revisedItems);
  assert.equal(diff.moved.length, 1);
  assert.equal(diff.moved[0].taskId, "t-1");
  assert.equal(diff.moved[0].shiftMinutes, 30);

  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].title, "Security Triage");

  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].title, "Review PRs");
});
