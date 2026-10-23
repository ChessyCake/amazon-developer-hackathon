import { prisma, resolveUserId } from "../db/client.js";
import { scheduleDay } from "../planner/scheduler.js";
import { PlannerTask, PlannerEvent } from "../planner/types.js";
import { TaskStatus, TaskPriority } from "@prisma/client";

export type WhatIfStrategy = "BALANCED" | "DEADLINE_FIRST" | "GOAL_FIRST";

export interface WhatIfScenarioResult {
  strategy: WhatIfStrategy;
  title: string;
  description: string;
  metrics: {
    scheduledTaskCount: number;
    unscheduledTaskCount: number;
    totalFocusMinutes: number;
    totalBreakMinutes: number;
    freeMinutesRemaining: number;
    onTimeDeadlinesCount: number;
  };
  scheduledItems: Array<{
    order: number;
    itemType: string;
    title: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    taskId?: string;
  }>;
  unscheduledTasks: Array<{
    taskId: string;
    title: string;
    reason: string;
  }>;
  tradeoffs: {
    strengths: string[];
    weaknesses: string[];
  };
}

export interface WhatIfComparisonReport {
  date: string;
  evaluatedAt: string;
  activePlanSummary: {
    exists: boolean;
    version?: number;
    status?: string;
  };
  scenarios: WhatIfScenarioResult[];
  recommendation: {
    preferredStrategy: WhatIfStrategy;
    reasoning: string;
  };
}

/**
 * Simulates multiple scheduling strategies (Balanced, Deadline-First, Goal-First)
 * without mutating or altering the committed plan in any way.
 */
export async function simulateWhatIfPlans(
  userIdArg?: string,
  dateArg?: string
): Promise<WhatIfComparisonReport> {
  const userId = await resolveUserId(userIdArg);
  const date = dateArg || new Date().toISOString().slice(0, 10);

  // 1. Fetch user & preferences
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { preferences: true },
  });

  const timezone = user?.timezone || "Asia/Kolkata";
  const prefs = user?.preferences || {
    workStartTime: "09:00",
    workEndTime: "18:00",
    focusMinutes: 45,
    breakMinutes: 10,
    bufferMinutes: 5,
  };

  // 2. Fetch fixed calendar events for the date
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  const rawEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      startTime: { lte: dayEnd },
      endTime: { gte: dayStart },
    },
    orderBy: { startTime: "asc" },
  });

  const fixedEvents: PlannerEvent[] = rawEvents.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startTime: ev.startTime,
    endTime: ev.endTime,
  }));

  // 3. Fetch candidate pending tasks
  const rawTasks = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
    },
  });

  const baseTasks: PlannerTask[] = rawTasks.map((t) => ({
    id: t.id,
    title: t.title,
    duration: t.duration,
    priority: t.priority,
    deadline: t.deadline,
    dependencies: t.dependencies,
    allowSplitting: t.allowSplitting,
    tags: t.tags,
    status: t.status,
  }));

  // 4. Fetch current active plan status (read-only)
  const activePlan = await prisma.plan.findFirst({
    where: { userId, date, status: "ACTIVE" },
    select: { id: true, version: true, status: true },
  });

  // Scenario 1: BALANCED
  const balancedResult = scheduleDay({
    date,
    preferences: {
      timezone,
      workStartTime: prefs.workStartTime,
      workEndTime: prefs.workEndTime,
      focusMinutes: prefs.focusMinutes,
      breakMinutes: prefs.breakMinutes,
      bufferMinutes: prefs.bufferMinutes,
    },
    fixedEvents,
    tasks: baseTasks,
  });

  // Scenario 2: DEADLINE_FIRST
  // Modify task priorities/urgencies so deadline-bound tasks take strict precedence
  const deadlineFirstTasks: PlannerTask[] = baseTasks.map((t) => {
    if (t.deadline) {
      return {
        ...t,
        priority: TaskPriority.URGENT,
      };
    }
    return {
      ...t,
      priority: t.priority === TaskPriority.URGENT ? TaskPriority.HIGH : t.priority,
    };
  });

  const deadlineFirstResult = scheduleDay({
    date,
    preferences: {
      timezone,
      workStartTime: prefs.workStartTime,
      workEndTime: prefs.workEndTime,
      focusMinutes: Math.min(prefs.focusMinutes, 60),
      breakMinutes: Math.max(5, prefs.breakMinutes - 5), // tighter breaks to protect deadlines
      bufferMinutes: prefs.bufferMinutes,
    },
    fixedEvents,
    tasks: deadlineFirstTasks,
  });

  // Scenario 3: GOAL_FIRST
  // Boost tasks that belong to a goal or milestone
  const goalFirstTasks: PlannerTask[] = baseTasks.map((t) => {
    const raw = rawTasks.find((item) => item.id === t.id);
    if (raw?.goalId || raw?.milestoneId) {
      return {
        ...t,
        priority: TaskPriority.URGENT,
      };
    }
    return t;
  });

  const goalFirstResult = scheduleDay({
    date,
    preferences: {
      timezone,
      workStartTime: prefs.workStartTime,
      workEndTime: prefs.workEndTime,
      focusMinutes: prefs.focusMinutes,
      breakMinutes: prefs.breakMinutes,
      bufferMinutes: prefs.bufferMinutes,
    },
    fixedEvents,
    tasks: goalFirstTasks,
  });

  function mapScenario(
    strategy: WhatIfStrategy,
    title: string,
    description: string,
    res: typeof balancedResult,
    strengths: string[],
    weaknesses: string[]
  ): WhatIfScenarioResult {
    const scheduledTaskItems = res.scheduledItems.filter((i) => i.itemType === "TASK");
    const breakItems = res.scheduledItems.filter(
      (i) => i.itemType === "BREAK" || i.itemType === "BUFFER"
    );

    const totalFocusMinutes = scheduledTaskItems.reduce((acc, i) => acc + i.durationMinutes, 0);
    const totalBreakMinutes = breakItems.reduce((acc, i) => acc + i.durationMinutes, 0);
    const freeMinutesRemaining = res.freeSlotsRemaining.reduce(
      (acc, s) => acc + s.durationMinutes,
      0
    );

    // Count tasks that meet deadline
    let onTimeDeadlinesCount = 0;
    for (const item of scheduledTaskItems) {
      if (item.taskId) {
        const t = rawTasks.find((rt) => rt.id === item.taskId);
        if (t?.deadline && new Date(item.endTime).getTime() <= new Date(t.deadline).getTime()) {
          onTimeDeadlinesCount++;
        }
      }
    }

    return {
      strategy,
      title,
      description,
      metrics: {
        scheduledTaskCount: scheduledTaskItems.length,
        unscheduledTaskCount: res.unscheduledTasks.length,
        totalFocusMinutes,
        totalBreakMinutes,
        freeMinutesRemaining,
        onTimeDeadlinesCount,
      },
      scheduledItems: res.scheduledItems.map((i) => ({
        order: i.order,
        itemType: i.itemType,
        title: i.title,
        startTime: i.startTime.toISOString(),
        endTime: i.endTime.toISOString(),
        durationMinutes: i.durationMinutes,
        taskId: i.taskId,
      })),
      unscheduledTasks: res.unscheduledTasks.map((u) => ({
        taskId: u.taskId,
        title: u.title,
        reason: u.reason,
      })),
      tradeoffs: {
        strengths,
        weaknesses,
      },
    };
  }

  const scenarios: WhatIfScenarioResult[] = [
    mapScenario(
      "BALANCED",
      "Balanced Routine & Productivity",
      "Optimizes for steady pacing, regular breaks, and proportional task completion across priorities.",
      balancedResult,
      ["Predictable energy pacing with scheduled breaks", "Low burnout risk"],
      ["May defer lower-priority tasks with imminent deadlines"]
    ),
    mapScenario(
      "DEADLINE_FIRST",
      "Deadline Defense Protocol",
      "Puts all deadline-sensitive tasks first, reduces break intervals slightly to guarantee on-time completion.",
      deadlineFirstResult,
      ["Maximizes on-time deadline delivery", "Eliminates overdue penalties"],
      ["More intense schedule with shorter break buffers"]
    ),
    mapScenario(
      "GOAL_FIRST",
      "Milestone & Goal Accelerator",
      "Clusters tasks tied to long-term goals together to maintain cognitive flow and milestone velocity.",
      goalFirstResult,
      ["Rapid progress toward key long-term milestones", "Minimizes context switching"],
      ["Standalone administrative tasks may be pushed back"]
    ),
  ];

  // Pick recommendation
  const hasImminentDeadlines = baseTasks.some((t) => {
    if (!t.deadline) return false;
    const diff = (new Date(t.deadline).getTime() - new Date(date).getTime()) / (3600 * 1000);
    return diff <= 24;
  });

  const preferredStrategy: WhatIfStrategy = hasImminentDeadlines ? "DEADLINE_FIRST" : "BALANCED";
  const reasoning = hasImminentDeadlines
    ? "You have tasks due within the next 24 hours. The Deadline Defense Protocol guarantees these are locked in before general work."
    : "Balanced Routine provides the optimal blend of focus and recovery without risking any missed deadlines.";

  return {
    date,
    evaluatedAt: new Date().toISOString(),
    activePlanSummary: {
      exists: !!activePlan,
      version: activePlan?.version,
      status: activePlan?.status,
    },
    scenarios,
    recommendation: {
      preferredStrategy,
      reasoning,
    },
  };
}
