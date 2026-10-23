import "dotenv/config";
import {
  PrismaClient,
  TaskPriority,
  TaskStatus,
  RecurrenceFrequency,
  GoalStatus,
  MilestoneStatus,
} from "@prisma/client";
import { generateAndSavePlan, approvePlan } from "../src/services/planService.js";
import { prisma } from "../src/db/client.js";

export const DEMO_USER_ID = process.env.DEMO_USER_ID ?? "demo-user-001";
export const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL ?? "demo@lifeos.local";
export const DEMO_TIMEZONE = process.env.DEFAULT_TIMEZONE ?? "Asia/Kolkata";
export const DEMO_DATE = "2026-10-22";

export async function seed() {
  console.log("Seeding database with deterministic demo data for Amazon Alexa+ Hackathon...");

  // 1. Upsert Demo User
  const user = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {
      email: DEMO_USER_EMAIL,
      name: "Demo Planner",
      timezone: DEMO_TIMEZONE,
    },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      name: "Demo Planner",
      timezone: DEMO_TIMEZONE,
    },
  });

  // 2. Upsert User Preferences (9 AM - 6 PM, 45m focus, 10m break, 5m buffer)
  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {
      focusMinutes: 45,
      breakMinutes: 10,
      workStartTime: "09:00",
      workEndTime: "18:00",
      bufferMinutes: 5,
    },
    create: {
      userId: user.id,
      focusMinutes: 45,
      breakMinutes: 10,
      workStartTime: "09:00",
      workEndTime: "18:00",
      bufferMinutes: 5,
    },
  });

  // 3. Clean prior demo artifacts for idempotent repeatability
  await prisma.planItem.deleteMany({ where: { plan: { userId: user.id } } });
  await prisma.plan.deleteMany({ where: { userId: user.id } });
  await prisma.calendarEvent.deleteMany({ where: { userId: user.id } });
  await prisma.task.deleteMany({ where: { userId: user.id } });
  await prisma.milestone.deleteMany({ where: { goal: { userId: user.id } } });
  await prisma.goal.deleteMany({ where: { userId: user.id } });
  await prisma.recurringRule.deleteMany({ where: { userId: user.id } });
  await prisma.actionHistory.deleteMany({ where: { userId: user.id } });

  // 4. Seed Fixed Calendar Events (Chemistry Lab 10:00 - 12:00 IST)
  const labEvent = await prisma.calendarEvent.create({
    data: {
      id: "evt-chemistry-lab",
      userId: user.id,
      title: "Chemistry Lab",
      description: "In-person chemistry experiment and lab analysis",
      startTime: new Date(`${DEMO_DATE}T10:00:00+05:30`),
      endTime: new Date(`${DEMO_DATE}T12:00:00+05:30`),
      location: "Science Complex Lab 3",
    },
  });

  await prisma.calendarEvent.create({
    data: {
      id: "evt-team-sync",
      userId: user.id,
      title: "Team Architecture Sync",
      description: "Alexa+ Hackathon architecture & submission check",
      startTime: new Date(`${DEMO_DATE}T15:30:00+05:30`),
      endTime: new Date(`${DEMO_DATE}T16:15:00+05:30`),
      location: "Virtual Meeting Room",
    },
  });

  // 5. Seed Core Academic & Productivity Tasks
  const osTask = await prisma.task.create({
    data: {
      id: "task-os-assignment",
      userId: user.id,
      title: "Operating Systems Assignment",
      description: "Implement multi-threaded process scheduler in C++",
      duration: 60,
      priority: TaskPriority.HIGH,
      deadline: new Date(`${DEMO_DATE}T23:59:59+05:30`),
      status: TaskStatus.PENDING,
      tags: ["academic", "cs", "priority"],
    },
  });

  const examTask = await prisma.task.create({
    data: {
      id: "task-exam-prep",
      userId: user.id,
      title: "Exam preparation",
      description: "Review virtual memory, page replacement algorithms, and synchronization",
      duration: 90,
      priority: TaskPriority.HIGH,
      deadline: new Date(`${DEMO_DATE}T23:59:59+05:30`),
      status: TaskStatus.PENDING,
      tags: ["academic", "exam", "preserved"],
    },
  });

  const dsaTask = await prisma.task.create({
    data: {
      id: "task-dsa-practice",
      userId: user.id,
      title: "DSA practice",
      description: "Solve 2 Graph & Dynamic Programming problems on LeetCode",
      duration: 60,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      tags: ["coding", "interview"],
    },
  });

  await prisma.task.create({
    data: {
      id: "task-alexa-mcp",
      userId: user.id,
      title: "Alexa+ MCP Integration Review",
      description: "Test Streamable HTTP transport and tool schema contracts",
      duration: 45,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      tags: ["alexa", "hackathon"],
    },
  });

  // 6. Seed High-Level Goal & Milestones
  const goal = await prisma.goal.create({
    data: {
      id: "goal-semester-excellence",
      userId: user.id,
      title: "Master Systems Programming & Ace Semester Finals",
      description: "Achieve top grades in OS, Algorithms, and Cloud Systems",
      targetDate: new Date("2026-11-30T18:00:00Z"),
      status: GoalStatus.ACTIVE,
    },
  });

  await prisma.milestone.createMany({
    data: [
      {
        goalId: goal.id,
        title: "Complete All OS Kernel Assignments",
        order: 1,
        status: MilestoneStatus.IN_PROGRESS,
      },
      {
        goalId: goal.id,
        title: "Solve 100 Advanced DSA Problems",
        order: 2,
        status: MilestoneStatus.PENDING,
      },
      {
        goalId: goal.id,
        title: "Mock Exam Simulation Drill",
        order: 3,
        status: MilestoneStatus.PENDING,
      },
    ],
  });

  // 7. Seed Daily Habit / Recurring Routine
  await prisma.recurringRule.create({
    data: {
      id: "rule-morning-standup",
      userId: user.id,
      title: "Morning Routine & Goal Review",
      description: "Habitual daily briefing and prioritization",
      duration: 15,
      priority: TaskPriority.HIGH,
      frequency: RecurrenceFrequency.DAILY,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      tags: ["routine", "morning"],
      startDate: new Date("1970-01-01T00:00:00Z"),
      isActive: true,
    },
  });

  // 8. Generate & Approve Initial Baseline Plan (Version 1 ACTIVE)
  console.log(`Generating deterministic baseline plan for ${DEMO_DATE}...`);
  const generatedPlan = await generateAndSavePlan({
    date: DEMO_DATE,
    userId: user.id,
    overwriteApproved: true,
  });

  await approvePlan(generatedPlan.planId, user.id);
  console.log(`Baseline plan ${generatedPlan.planId} approved as Version 1 ACTIVE.`);

  // 9. Record Initial ActionHistory Audit Log
  await prisma.actionHistory.create({
    data: {
      userId: user.id,
      actionType: "SEED_DEMO_BASELINE",
      entityType: "SYSTEM",
      payload: {
        timestamp: new Date().toISOString(),
        demoDate: DEMO_DATE,
        eventsSeeded: 2,
        tasksSeeded: 4,
        planId: generatedPlan.planId,
        labEventId: labEvent.id,
      },
    },
  });

  console.log("Deterministic seed completed successfully!");
  console.log(`Demo User: ${DEMO_USER_ID} (${DEMO_USER_EMAIL})`);
  console.log(`Demo Date: ${DEMO_DATE}`);
  console.log(`Chemistry Lab Event ID: ${labEvent.id}`);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .catch((e) => {
      console.error("Seeding failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
