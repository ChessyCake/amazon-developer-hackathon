import "dotenv/config";
import { PrismaClient, TaskPriority, TaskStatus } from "@prisma/client";

const prisma = new PrismaClient();

export const DEMO_USER_ID = process.env.DEMO_USER_ID ?? "demo-user-001";
export const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL ?? "demo@lifeos.local";
export const DEMO_TIMEZONE = process.env.DEFAULT_TIMEZONE ?? "Asia/Kolkata";

export async function seed() {
  console.log("Seeding database with deterministic demo data...");

  // Upsert demo user
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

  // Upsert default preferences
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

  // Clean old seed events & tasks for deterministic behavior
  await prisma.planItem.deleteMany({
    where: { plan: { userId: user.id } },
  });
  await prisma.plan.deleteMany({
    where: { userId: user.id },
  });
  await prisma.calendarEvent.deleteMany({
    where: { userId: user.id },
  });
  await prisma.task.deleteMany({
    where: { userId: user.id },
  });

  // Seed sample fixed calendar events for 2026-10-18 (Asia/Kolkata is UTC+5:30)
  // 10:00 IST = 04:30 UTC
  // 14:00 IST = 08:30 UTC
  await prisma.calendarEvent.createMany({
    data: [
      {
        id: "evt-standup-001",
        userId: user.id,
        title: "LifeOS Daily Standup",
        description: "Review MCP tools and roadmap",
        startTime: new Date("2026-10-18T04:30:00.000Z"),
        endTime: new Date("2026-10-18T05:00:00.000Z"),
        location: "Alexa Developer Slack",
      },
      {
        id: "evt-review-002",
        userId: user.id,
        title: "Sprint Review & Architecture Sync",
        description: "Demo MCP Streamable HTTP transport",
        startTime: new Date("2026-10-18T08:30:00.000Z"),
        endTime: new Date("2026-10-18T09:30:00.000Z"),
        location: "Virtual Room A",
      },
    ],
  });

  // Seed sample tasks
  await prisma.task.createMany({
    data: [
      {
        id: "task-seed-001",
        userId: user.id,
        title: "Draft Alexa Skill Architecture",
        description: "Specify interaction model and MCP bridge",
        duration: 60,
        priority: TaskPriority.HIGH,
        deadline: new Date("2026-10-18T18:00:00.000Z"),
        status: TaskStatus.PENDING,
        tags: ["architecture", "alexa"],
      },
      {
        id: "task-seed-002",
        userId: user.id,
        title: "Refactor MCP Streamable transport",
        description: "Ensure full compliance with MCP specification",
        duration: 45,
        priority: TaskPriority.MEDIUM,
        deadline: new Date("2026-10-18T20:00:00.000Z"),
        status: TaskStatus.PENDING,
        tags: ["mcp", "backend"],
      },
      {
        id: "task-seed-003",
        userId: user.id,
        title: "Prepare Stage 1 Demo Script",
        description: "Document test scenarios and curl examples",
        duration: 30,
        priority: TaskPriority.LOW,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        tags: ["demo", "docs"],
      },
    ],
  });

  // Record action history
  await prisma.actionHistory.create({
    data: {
      userId: user.id,
      actionType: "SEED_DATABASE",
      entityType: "SYSTEM",
      payload: {
        timestamp: new Date().toISOString(),
        tasksSeeded: 3,
        eventsSeeded: 2,
      },
    },
  });

  console.log("Seeding completed successfully.");
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
