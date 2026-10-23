import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/client.js";
import {
  createGoal,
  listGoals,
  getGoal,
  decomposeGoal,
} from "../src/services/goalService.js";
import { analyzeDeadlineRisks } from "../src/services/riskAnalysisService.js";
import {
  createRecurringRule,
  listRecurringRules,
  generateRecurringTasks,
} from "../src/services/recurringService.js";
import { getDailyBriefing } from "../src/services/briefingService.js";
import { simulateWhatIfPlans } from "../src/services/whatIfService.js";
import { getWeeklyReview } from "../src/services/reviewService.js";
import {
  startFocusSession,
  recordInterruption,
  completeFocusSession,
} from "../src/services/focusSessionService.js";
import { scheduleDay } from "../src/planner/scheduler.js";
import { generateAndSavePlan, approvePlan } from "../src/services/planService.js";
import { TaskPriority, TaskStatus, RecurrenceFrequency } from "@prisma/client";

const TEST_STAGE6_USER = "test-stage6-user-001";
const TEST_DATE = "2026-10-22";

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_STAGE6_USER },
    update: {},
    create: {
      id: TEST_STAGE6_USER,
      email: "stage6_tester@lifeos.local",
      name: "Stage 6 Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: TEST_STAGE6_USER },
    update: {
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 45,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
    create: {
      userId: TEST_STAGE6_USER,
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 45,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
  });

  // Clean test artifacts
  await prisma.focusSession.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_STAGE6_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.milestone.deleteMany({ where: { goal: { userId: TEST_STAGE6_USER } } });
  await prisma.goal.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.recurringRule.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_STAGE6_USER } });
});

test.after(async () => {
  await prisma.focusSession.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_STAGE6_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.milestone.deleteMany({ where: { goal: { userId: TEST_STAGE6_USER } } });
  await prisma.goal.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.recurringRule.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_STAGE6_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_STAGE6_USER } });
  await prisma.$disconnect();
});

test("Goal Decomposition: turns long-term goal into milestones & schedulable tasks with dependency wiring", async () => {
  // 1. Create long-term goal
  const goal = await createGoal({
    userId: TEST_STAGE6_USER,
    title: "AWS Certification Preparation",
    description: "Complete Cloud Practitioner certification modules and practice exams",
    targetDate: "2026-11-15",
  });

  assert.equal(goal.title, "AWS Certification Preparation");
  assert.equal(goal.userId, TEST_STAGE6_USER);

  // 2. Decompose into milestones and tasks
  const decomposition = await decomposeGoal({
    goalId: goal.id,
    userId: TEST_STAGE6_USER,
    milestones: [
      {
        title: "Milestone 1: Core Cloud Concepts",
        tasks: [
          {
            key: "read-iam",
            title: "Study IAM and Security",
            duration: 45,
            priority: TaskPriority.HIGH,
          },
          {
            key: "lab-iam",
            title: "Hands-on IAM Policies Lab",
            duration: 60,
            priority: TaskPriority.HIGH,
            dependsOnKeys: ["read-iam"],
          },
        ],
      },
      {
        title: "Milestone 2: Compute & Storage",
        tasks: [
          {
            key: "ec2-s3-theory",
            title: "Review EC2 and S3 Arch",
            duration: 45,
            priority: TaskPriority.MEDIUM,
          },
        ],
      },
    ],
  });

  assert.equal(decomposition.milestones.length, 2);
  assert.equal(decomposition.tasks.length, 3);

  // Verify dependency resolution
  const readTask = decomposition.tasks.find((t) => t.title === "Study IAM and Security");
  const labTask = decomposition.tasks.find((t) => t.title === "Hands-on IAM Policies Lab");

  assert.ok(readTask);
  assert.ok(labTask);
  assert.ok(labTask.dependencies.includes(readTask.id));

  // 3. Verify Goal Progress Metrics
  const retrieved = await getGoal(goal.id, TEST_STAGE6_USER);
  assert.equal(retrieved.totalTasks, 3);
  assert.equal(retrieved.completedTasks, 0);
  assert.equal(retrieved.progressPercent, 0);
  assert.equal(retrieved.remainingMinutes, 150);

  // 4. Verify scheduler deterministically schedules goal tasks respecting dependency
  const schedule = scheduleDay({
    date: TEST_DATE,
    preferences: {
      timezone: "Asia/Kolkata",
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 45,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
    fixedEvents: [],
    tasks: decomposition.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      priority: t.priority,
      dependencies: t.dependencies,
      allowSplitting: false,
      status: TaskStatus.PENDING,
    })),
  });

  const scheduledRead = schedule.scheduledItems.find((i) => i.taskId === readTask.id);
  const scheduledLab = schedule.scheduledItems.find((i) => i.taskId === labTask.id);

  assert.ok(scheduledRead);
  assert.ok(scheduledLab);
  assert.ok(
    new Date(scheduledRead.endTime).getTime() <= new Date(scheduledLab.startTime).getTime(),
    "Prerequisite 'Study IAM' must finish before 'Hands-on IAM Lab' starts"
  );
});

test("Deadline Risk Analysis: provides transparent mathematical reasoning without invented probabilities", async () => {
  // 1. Create a goal due today at 18:00 with 7 hours of work, but only 4 hours free due to fixed meetings
  const tightGoal = await createGoal({
    userId: TEST_STAGE6_USER,
    title: "Urgent Client Deliverable",
    targetDate: `${TEST_DATE}T18:00:00+05:30`,
  });

  await decomposeGoal({
    goalId: tightGoal.id,
    userId: TEST_STAGE6_USER,
    milestones: [
      {
        title: "M1",
        tasks: [
          { title: "Design Architecture Doc", duration: 180, priority: TaskPriority.URGENT },
          { title: "Prototype Implementation", duration: 240, priority: TaskPriority.URGENT },
        ],
      },
    ],
  });

  // Add 4-hour meeting today
  await prisma.calendarEvent.create({
    data: {
      userId: TEST_STAGE6_USER,
      title: "All-Day Technical Review",
      startTime: new Date(`${TEST_DATE}T10:00:00+05:30`),
      endTime: new Date(`${TEST_DATE}T15:00:00+05:30`),
    },
  });

  const report = await analyzeDeadlineRisks(TEST_STAGE6_USER, {
    asOfDate: `${TEST_DATE}T09:00:00+05:30`,
    lookaheadDays: 7,
  });

  assert.ok(report);
  assert.ok(report.summary.totalEvaluated >= 1);
  const urgentItem = report.risks.find((r) => r.id === tightGoal.id);
  assert.ok(urgentItem);
  assert.ok(
    urgentItem.riskLevel === "CRITICAL" || urgentItem.riskLevel === "HIGH_RISK",
    `Expected high or critical risk, got ${urgentItem.riskLevel}`
  );
  assert.ok(urgentItem.reasoning.length > 20);
  assert.ok(typeof urgentItem.slackMinutes === "number");
  assert.ok(urgentItem.recommendations.length > 0);
  assert.equal(typeof urgentItem.inputs.totalRemainingWorkHours, "number");
});

test("Recurring Tasks: guarantees zero duplicate occurrences using composite unique constraints", async () => {
  // 1. Create Daily Routine
  const rule = await createRecurringRule({
    userId: TEST_STAGE6_USER,
    title: "Morning Standup & Planning",
    duration: 15,
    priority: TaskPriority.HIGH,
    frequency: RecurrenceFrequency.DAILY,
  });

  assert.ok(rule.id);
  assert.equal(rule.frequency, "DAILY");

  // 2. Generate occurrences for TEST_DATE
  const run1 = await generateRecurringTasks(TEST_STAGE6_USER, TEST_DATE, 1);
  assert.equal(run1.generatedCount, 1);
  assert.equal(run1.tasks[0].title, "Morning Standup & Planning");
  assert.equal(run1.tasks[0].recurrenceDate, TEST_DATE);

  // 3. Second run must be idempotent (zero duplicates)
  const run2 = await generateRecurringTasks(TEST_STAGE6_USER, TEST_DATE, 1);
  assert.equal(run2.generatedCount, 1); // Upserted existing record

  const countInDb = await prisma.task.count({
    where: {
      userId: TEST_STAGE6_USER,
      recurringRuleId: rule.id,
      recurrenceDate: TEST_DATE,
    },
  });
  assert.equal(countInDb, 1, "Database unique constraint must enforce exactly 1 occurrence");
});

test("Daily Briefing: synthesizes today's commitments strictly from stored DB records", async () => {
  const briefing = await getDailyBriefing(TEST_STAGE6_USER, TEST_DATE);

  assert.ok(briefing);
  assert.equal(briefing.date, TEST_DATE);
  assert.ok(briefing.executiveSummary.length > 10);
  assert.equal(typeof briefing.metrics.meetingCount, "number");
  assert.equal(typeof briefing.metrics.plannedFocusHours, "number");
  assert.ok(Array.isArray(briefing.conflictsAndWarnings));
  assert.ok(briefing.recommendedFocus.length > 5);
});

test("What-If Planning: compares Balanced, Deadline-First, and Goal-First without mutating committed plan", async () => {
  // Commit an active plan first
  const { planId } = await generateAndSavePlan({ date: TEST_DATE, userId: TEST_STAGE6_USER });
  await approvePlan(planId, TEST_STAGE6_USER);

  const beforePlan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { items: true },
  });
  const beforeItemCount = beforePlan?.items.length;

  // Run What-If simulation
  const report = await simulateWhatIfPlans(TEST_STAGE6_USER, TEST_DATE);

  assert.equal(report.scenarios.length, 3);
  const strategies = report.scenarios.map((s) => s.strategy);
  assert.ok(strategies.includes("BALANCED"));
  assert.ok(strategies.includes("DEADLINE_FIRST"));
  assert.ok(strategies.includes("GOAL_FIRST"));

  // Verify that active plan in DB is completely UNTOUCHED
  const afterPlan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { items: true },
  });
  assert.equal(afterPlan?.status, "ACTIVE");
  assert.equal(afterPlan?.items.length, beforeItemCount);
});

test("Weekly Review: calculates real retrospective metrics from stored database tasks & plans", async () => {
  // Create and complete a task
  const completedTask = await prisma.task.create({
    data: {
      userId: TEST_STAGE6_USER,
      title: "Completed Project Architecture Review",
      duration: 60,
      priority: TaskPriority.HIGH,
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      tags: ["engineering"],
    },
  });

  const review = await getWeeklyReview(TEST_STAGE6_USER);

  assert.ok(review);
  assert.ok(review.metrics.tasksCompleted >= 1);
  assert.ok(review.metrics.totalFocusHours > 0);
  assert.ok(review.completedHighlights.some((t) => t.id === completedTask.id));
  assert.ok(review.synthesis.includes("completed"));
});

test("Focus Sessions: logs session start, interruptions, duration, and task completion", async () => {
  const task = await prisma.task.create({
    data: {
      userId: TEST_STAGE6_USER,
      title: "Deep Coding Session",
      duration: 45,
      status: TaskStatus.PENDING,
    },
  });

  // 1. Start session
  const session = await startFocusSession({
    userId: TEST_STAGE6_USER,
    taskId: task.id,
    notes: "Implement core algorithm",
  });
  assert.equal(session.status, "ACTIVE");
  assert.equal(session.interruptionsCount, 0);

  // 2. Record interruption
  const interrupted = await recordInterruption(
    session.id,
    TEST_STAGE6_USER,
    "Urgent server notification"
  );
  assert.equal(interrupted.interruptionsCount, 1);
  assert.ok(interrupted.notes?.includes("Urgent server notification"));

  // 3. Complete session and task
  const completed = await completeFocusSession({
    sessionId: session.id,
    userId: TEST_STAGE6_USER,
    notes: "Algorithm completed with 100% test coverage",
    markTaskComplete: true,
  });

  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.durationMinutes! >= 1);

  // Verify task was marked COMPLETED
  const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
  assert.equal(updatedTask?.status, TaskStatus.COMPLETED);
});
