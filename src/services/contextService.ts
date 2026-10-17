import { TaskStatus } from "@prisma/client";
import { prisma, resolveUserId } from "../db/client.js";
import { getDayRangeInTimezone } from "../utils/timezone.js";

export interface DayContextResponse {
  date: string;
  timezone: string;
  fixedEvents: Array<{
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    isAllDay: boolean;
    location: string | null;
  }>;
  pendingTasks: Array<{
    id: string;
    title: string;
    description: string | null;
    duration: number;
    priority: string;
    deadline: string | null;
    status: string;
    tags: string[];
    createdAt: string;
  }>;
  preferences: {
    focusMinutes: number;
    breakMinutes: number;
    workStartTime: string;
    workEndTime: string;
    bufferMinutes: number;
  };
}

export async function getDayContext(
  date: string,
  userId?: string
): Promise<DayContextResponse> {
  const targetUserId = await resolveUserId(userId);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: {
      preferences: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${targetUserId}`);
  }

  const timezone = user.timezone || "Asia/Kolkata";
  const { start, end } = getDayRangeInTimezone(date, timezone);

  // Find fixed calendar events overlapping with the date
  const events = await prisma.calendarEvent.findMany({
    where: {
      userId: targetUserId,
      startTime: { lte: end },
      endTime: { gte: start },
    },
    orderBy: { startTime: "asc" },
  });

  // Find pending or in-progress tasks
  const tasks = await prisma.task.findMany({
    where: {
      userId: targetUserId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
    },
    orderBy: [
      { priority: "desc" },
      { deadline: "asc" },
      { createdAt: "desc" },
    ],
  });

  const preferences = user.preferences ?? {
    focusMinutes: 45,
    breakMinutes: 10,
    workStartTime: "09:00",
    workEndTime: "18:00",
    bufferMinutes: 5,
  };

  return {
    date,
    timezone,
    fixedEvents: events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      isAllDay: e.isAllDay,
      location: e.location,
    })),
    pendingTasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      duration: t.duration,
      priority: t.priority,
      deadline: t.deadline?.toISOString() ?? null,
      status: t.status,
      tags: t.tags,
      createdAt: t.createdAt.toISOString(),
    })),
    preferences: {
      focusMinutes: preferences.focusMinutes,
      breakMinutes: preferences.breakMinutes,
      workStartTime: preferences.workStartTime,
      workEndTime: preferences.workEndTime,
      bufferMinutes: preferences.bufferMinutes,
    },
  };
}
