import { prisma, resolveUserId } from "../db/client.js";
import { getPlan } from "./planService.js";
import { analyzeDeadlineRisks } from "./riskAnalysisService.js";
import { TaskPriority, TaskStatus } from "@prisma/client";

export interface DailyBriefingReport {
  date: string;
  generatedAt: string;
  greeting: string;
  executiveSummary: string;
  metrics: {
    scheduledTaskCount: number;
    meetingCount: number;
    plannedFocusHours: number;
    meetingHours: number;
    breakMinutes: number;
    overdueTasksCount: number;
    criticalRisksCount: number;
  };
  scheduleHighlights: {
    firstCommitment: string | null;
    lastCommitment: string | null;
    deepWorkSlots: Array<{ title: string; time: string; durationMinutes: number }>;
  };
  urgentPriorities: Array<{
    id: string;
    title: string;
    priority: string;
    deadline: string | null;
    duration: number;
  }>;
  conflictsAndWarnings: string[];
  recommendedFocus: string;
}

/**
 * Generates an executive daily briefing synthesized strictly from stored database records.
 */
export async function getDailyBriefing(
  userIdArg?: string,
  dateArg?: string
): Promise<DailyBriefingReport> {
  const userId = await resolveUserId(userIdArg);
  const date = dateArg || new Date().toISOString().slice(0, 10);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, timezone: true },
  });
  const userName = user?.name || "Planner";

  // 1. Fetch active plan for today
  const { plan } = await getPlan(date, userId);

  // 2. Fetch fixed calendar events for today
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  const calendarEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      startTime: { lte: dayEnd },
      endTime: { gte: dayStart },
    },
    orderBy: { startTime: "asc" },
  });

  // 3. Fetch overdue tasks & urgent tasks
  const overdueTasks = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      deadline: { lt: dayStart },
    },
    select: { id: true, title: true, deadline: true, priority: true, duration: true },
  });

  const urgentTasks = await prisma.task.findMany({
    where: {
      userId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      OR: [
        { priority: { in: [TaskPriority.HIGH, TaskPriority.URGENT] } },
        { deadline: { gte: dayStart, lte: dayEnd } },
      ],
    },
    orderBy: { priority: "desc" },
    take: 5,
    select: { id: true, title: true, priority: true, deadline: true, duration: true },
  });

  // 4. Fetch deadline risks
  const riskReport = await analyzeDeadlineRisks(userId, { asOfDate: date, lookaheadDays: 7 });
  const criticalRisks = riskReport.risks.filter((r) => r.riskLevel === "CRITICAL");

  // 5. Compute metrics from actual plan items
  let plannedFocusMinutes = 0;
  let plannedBreakMinutes = 0;
  let scheduledTaskCount = 0;
  const deepWorkSlots: Array<{ title: string; time: string; durationMinutes: number }> = [];
  let firstCommitment: string | null = null;
  let lastCommitment: string | null = null;

  if (plan && plan.items) {
    const sortedItems = [...plan.items].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    if (sortedItems.length > 0) {
      firstCommitment = new Date(sortedItems[0].startTime).toISOString().slice(11, 16);
      lastCommitment = new Date(sortedItems[sortedItems.length - 1].endTime).toISOString().slice(11, 16);
    }

    for (const item of sortedItems) {
      const dur = Math.round(
        (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / (60 * 1000)
      );
      if (item.itemType === "TASK") {
        scheduledTaskCount++;
        plannedFocusMinutes += dur;
        if (dur >= 30) {
          deepWorkSlots.push({
            title: item.title,
            time: `${new Date(item.startTime).toISOString().slice(11, 16)} - ${new Date(item.endTime).toISOString().slice(11, 16)}`,
            durationMinutes: dur,
          });
        }
      } else if (item.itemType === "BREAK" || item.itemType === "BUFFER") {
        plannedBreakMinutes += dur;
      }
    }
  }

  // Meeting duration
  const meetingMinutes = calendarEvents.reduce((acc, ev) => {
    return acc + Math.round((ev.endTime.getTime() - ev.startTime.getTime()) / (60 * 1000));
  }, 0);

  // 6. Identify conflicts & warnings
  const conflictsAndWarnings: string[] = [];
  if (overdueTasks.length > 0) {
    conflictsAndWarnings.push(
      `You have ${overdueTasks.length} overdue task(s) needing rescheduling or immediate completion.`
    );
  }
  for (const crit of criticalRisks) {
    conflictsAndWarnings.push(`Critical deadline risk on "${crit.title}": ${crit.reasoning}`);
  }
  if (!plan) {
    conflictsAndWarnings.push("No active schedule generated for today yet. Run plan generation to optimize slots.");
  }

  // 7. Compose executive summary
  const focusHours = Number((plannedFocusMinutes / 60).toFixed(1));
  const meetHours = Number((meetingMinutes / 60).toFixed(1));

  let executiveSummary = `Good day, ${userName}! `;
  if (plan) {
    executiveSummary += `Today has ${calendarEvents.length} calendar event(s) (${meetHours}h) and ${scheduledTaskCount} scheduled task block(s) (${focusHours}h focus). `;
  } else {
    executiveSummary += `You have ${calendarEvents.length} meeting(s) (${meetHours}h) and ${urgentTasks.length} urgent tasks awaiting scheduling. `;
  }

  if (criticalRisks.length > 0) {
    executiveSummary += `Warning: ${criticalRisks.length} goal/task deadline(s) require immediate mitigation.`;
  } else {
    executiveSummary += "All commitments are on track within allocated focus intervals.";
  }

  const recommendedFocus =
    urgentTasks.length > 0
      ? `Focus on "${urgentTasks[0].title}" (${urgentTasks[0].duration} min, ${urgentTasks[0].priority} priority).`
      : "Complete scheduled morning focus blocks and review weekly goals.";

  return {
    date,
    generatedAt: new Date().toISOString(),
    greeting: `Good morning, ${userName}!`,
    executiveSummary,
    metrics: {
      scheduledTaskCount,
      meetingCount: calendarEvents.length,
      plannedFocusHours: focusHours,
      meetingHours: meetHours,
      breakMinutes: plannedBreakMinutes,
      overdueTasksCount: overdueTasks.length,
      criticalRisksCount: criticalRisks.length,
    },
    scheduleHighlights: {
      firstCommitment,
      lastCommitment,
      deepWorkSlots,
    },
    urgentPriorities: urgentTasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      deadline: t.deadline?.toISOString() || null,
      duration: t.duration,
    })),
    conflictsAndWarnings,
    recommendedFocus,
  };
}
