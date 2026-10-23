import { prisma, resolveUserId } from "../db/client.js";
import { TaskStatus } from "@prisma/client";

export interface WeeklyReviewReport {
  weekRange: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    tasksCompleted: number;
    totalFocusHours: number;
    plannedHours: number;
    actualHours: number;
    adherencePercentage: number;
    overdueTasksCount: number;
    activeGoalsCount: number;
  };
  completedHighlights: Array<{
    id: string;
    title: string;
    duration: number;
    completedAt: string | null;
    tags: string[];
  }>;
  overdueTasks: Array<{
    id: string;
    title: string;
    deadline: string | null;
    duration: number;
  }>;
  categoryBreakdown: Array<{
    tag: string;
    minutes: number;
    percentage: number;
  }>;
  nextWeekPriorities: Array<{
    type: "GOAL" | "TASK";
    title: string;
    deadline: string | null;
    estimatedMinutes: number;
    recommendation: string;
  }>;
  synthesis: string;
}

/**
 * Derives a weekly review strictly from actual database records across
 * tasks, completed plans, and goals.
 */
export async function getWeeklyReview(
  userIdArg?: string,
  weekStartDateArg?: string
): Promise<WeeklyReviewReport> {
  const userId = await resolveUserId(userIdArg);

  // Compute 7-day range
  const endDate = weekStartDateArg
    ? new Date(new Date(weekStartDateArg).getTime() + 7 * 24 * 60 * 60 * 1000)
    : new Date();
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // 1. Completed tasks in window
  const completedTasks = await prisma.task.findMany({
    where: {
      userId,
      status: TaskStatus.COMPLETED,
      completedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { completedAt: "desc" },
  });

  const actualMinutes = completedTasks.reduce((acc, t) => acc + t.duration, 0);

  // 2. Planned items across plans within the window
  const startStr = startIso.slice(0, 10);
  const endStr = endIso.slice(0, 10);

  const plansInWeek = await prisma.plan.findMany({
    where: {
      userId,
      date: { gte: startStr, lte: endStr },
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    include: { items: true },
  });

  let plannedMinutes = 0;
  for (const p of plansInWeek) {
    for (const item of p.items) {
      if (item.itemType === "TASK") {
        const itemDur = Math.round(
          (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / (60 * 1000)
        );
        plannedMinutes += itemDur;
      }
    }
  }

  // 3. Overdue tasks
  const overdueTasks = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      deadline: { lt: endDate },
    },
    select: { id: true, title: true, deadline: true, duration: true },
  });

  // 4. Tag / category breakdown
  const tagMap = new Map<string, number>();
  for (const t of completedTasks) {
    const primaryTag = t.tags.length > 0 ? t.tags[0] : "general";
    tagMap.set(primaryTag, (tagMap.get(primaryTag) || 0) + t.duration);
  }

  const categoryBreakdown = Array.from(tagMap.entries()).map(([tag, minutes]) => ({
    tag,
    minutes,
    percentage: actualMinutes > 0 ? Math.round((minutes / actualMinutes) * 100) : 0,
  }));

  // 5. Active goals
  const activeGoals = await prisma.goal.findMany({
    where: { userId, status: "ACTIVE" },
    include: { tasks: { where: { status: "PENDING" } } },
  });

  // 6. Priorities for next week
  const nextWeekEnd = new Date(endDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingTasks = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      deadline: { gte: endDate, lte: nextWeekEnd },
    },
    take: 5,
    orderBy: { priority: "desc" },
  });

  const nextWeekPriorities: WeeklyReviewReport["nextWeekPriorities"] = [];
  for (const g of activeGoals) {
    const remMins = g.tasks.reduce((acc, t) => acc + t.duration, 0);
    if (g.targetDate && g.targetDate <= nextWeekEnd) {
      nextWeekPriorities.push({
        type: "GOAL",
        title: g.title,
        deadline: g.targetDate.toISOString().slice(0, 10),
        estimatedMinutes: remMins,
        recommendation: `Target completion date this coming week. Allocate ${Math.ceil(remMins / 60)}h across upcoming plans.`,
      });
    }
  }

  for (const t of upcomingTasks) {
    nextWeekPriorities.push({
      type: "TASK",
      title: t.title,
      deadline: t.deadline?.toISOString() || null,
      estimatedMinutes: t.duration,
      recommendation: `High priority item due next week.`,
    });
  }

  const adherence =
    plannedMinutes > 0 ? Math.min(100, Math.round((actualMinutes / plannedMinutes) * 100)) : 100;
  const actualHours = Number((actualMinutes / 60).toFixed(1));
  const plannedHours = Number((plannedMinutes / 60).toFixed(1));

  const synthesis = `During the period ${startStr} to ${endStr}, you completed ${completedTasks.length} task(s) totaling ${actualHours}h of actual focus work (planned: ${plannedHours}h, ${adherence}% adherence). ${overdueTasks.length} task(s) were overdue. For next week, ${nextWeekPriorities.length} key priorities require scheduling.`;

  return {
    weekRange: {
      startDate: startStr,
      endDate: endStr,
    },
    metrics: {
      tasksCompleted: completedTasks.length,
      totalFocusHours: actualHours,
      plannedHours,
      actualHours,
      adherencePercentage: adherence,
      overdueTasksCount: overdueTasks.length,
      activeGoalsCount: activeGoals.length,
    },
    completedHighlights: completedTasks.slice(0, 10).map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      completedAt: t.completedAt?.toISOString() || null,
      tags: t.tags,
    })),
    overdueTasks: overdueTasks.map((t) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline?.toISOString() || null,
      duration: t.duration,
    })),
    categoryBreakdown,
    nextWeekPriorities,
    synthesis,
  };
}
