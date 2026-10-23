import { prisma, resolveUserId } from "../db/client.js";
import { TaskStatus } from "@prisma/client";
import { getWorkWindow } from "../planner/intervals.js";

export type RiskLevel = "CRITICAL" | "HIGH_RISK" | "MODERATE_RISK" | "ON_TRACK";

export interface DeadlineRiskItem {
  id: string;
  type: "GOAL" | "TASK";
  title: string;
  deadline: string;
  riskLevel: RiskLevel;
  requiredWorkMinutes: number;
  availableWorkMinutes: number;
  slackMinutes: number;
  bufferPercentage: number;
  remainingTaskCount: number;
  reasoning: string;
  inputs: {
    deadlineDate: string;
    totalRemainingWorkHours: number;
    availableWorkingHours: number;
    calendarMeetingHours: number;
    slackHours: number;
    hasBlockingDependencies: boolean;
  };
  recommendations: string[];
}

export interface RiskAnalysisReport {
  evaluatedAt: string;
  summary: {
    totalEvaluated: number;
    critical: number;
    highRisk: number;
    moderateRisk: number;
    onTrack: number;
    overallStatus: "RED" | "AMBER" | "GREEN";
  };
  risks: DeadlineRiskItem[];
}

/**
 * Deterministically calculates deadline risks based on remaining work,
 * actual available working hours from preferences, calendar commitments, and dependencies.
 * Never invents probabilities; provides transparent mathematical reasoning.
 */
export async function analyzeDeadlineRisks(
  userIdArg?: string,
  options?: { asOfDate?: string | Date; lookaheadDays?: number }
): Promise<RiskAnalysisReport> {
  const userId = await resolveUserId(userIdArg);
  const now = options?.asOfDate ? new Date(options.asOfDate) : new Date();
  const lookaheadDays = options?.lookaheadDays ?? 14;
  const horizon = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

  // 1. Fetch user preferences & timezone
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { preferences: true },
  });

  const timezone = user?.timezone || "Asia/Kolkata";
  const workStart = user?.preferences?.workStartTime || "09:00";
  const workEnd = user?.preferences?.workEndTime || "18:00";

  // 2. Fetch fixed calendar events in the lookahead window
  const calendarEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      startTime: { lte: horizon },
      endTime: { gte: now },
    },
    orderBy: { startTime: "asc" },
  });

  // Helper function to calculate free work minutes between two dates
  function calculateAvailableWorkMinutes(startDate: Date, endDate: Date): {
    availableMinutes: number;
    meetingMinutes: number;
  } {
    let totalWorkMinutes = 0;
    let totalMeetingMinutes = 0;

    // Iterate through each day
    const currentDay = new Date(startDate);
    currentDay.setHours(0, 0, 0, 0);

    const endDay = new Date(endDate);
    endDay.setHours(23, 59, 59, 999);

    while (currentDay <= endDay) {
      const dateStr = currentDay.toISOString().slice(0, 10);
      try {
        const { windowStart, windowEnd } = getWorkWindow(dateStr, workStart, workEnd, timezone);

        // Effective start for this day
        const dayEffectiveStart = new Date(Math.max(windowStart.getTime(), startDate.getTime()));
        const dayEffectiveEnd = new Date(Math.min(windowEnd.getTime(), endDate.getTime()));

        if (dayEffectiveStart < dayEffectiveEnd) {
          const rawDayMinutes = Math.round(
            (dayEffectiveEnd.getTime() - dayEffectiveStart.getTime()) / (60 * 1000)
          );

          // Find overlapping calendar meetings in this day's work window
          let dayMeetingMinutes = 0;
          for (const ev of calendarEvents) {
            const evStart = new Date(Math.max(ev.startTime.getTime(), dayEffectiveStart.getTime()));
            const evEnd = new Date(Math.min(ev.endTime.getTime(), dayEffectiveEnd.getTime()));
            if (evStart < evEnd) {
              dayMeetingMinutes += Math.round((evEnd.getTime() - evStart.getTime()) / (60 * 1000));
            }
          }

          const freeDayMinutes = Math.max(0, rawDayMinutes - dayMeetingMinutes);
          totalWorkMinutes += freeDayMinutes;
          totalMeetingMinutes += dayMeetingMinutes;
        }
      } catch {
        // Fallback standard 8h day minus meetings
        totalWorkMinutes += 8 * 60;
      }

      currentDay.setDate(currentDay.getDate() + 1);
    }

    return { availableMinutes: totalWorkMinutes, meetingMinutes: totalMeetingMinutes };
  }

  const riskItems: DeadlineRiskItem[] = [];

  // 3. Analyze Goals with Target Dates
  const goals = await prisma.goal.findMany({
    where: {
      userId,
      status: "ACTIVE",
      targetDate: { not: null, lte: horizon },
    },
    include: {
      tasks: {
        where: {
          status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        },
      },
    },
  });

  for (const goal of goals) {
    if (!goal.targetDate) continue;

    const remainingTasks = goal.tasks;
    const requiredWorkMinutes = remainingTasks.reduce((acc, t) => acc + t.duration, 0);
    const deadline = goal.targetDate;

    // Check dependencies
    const hasBlockingDependencies = remainingTasks.some((t) => t.dependencies.length > 0);

    if (deadline < now) {
      // Overdue
      riskItems.push({
        id: goal.id,
        type: "GOAL",
        title: goal.title,
        deadline: deadline.toISOString(),
        riskLevel: "CRITICAL",
        requiredWorkMinutes,
        availableWorkMinutes: 0,
        slackMinutes: -requiredWorkMinutes,
        bufferPercentage: -100,
        remainingTaskCount: remainingTasks.length,
        reasoning: `Goal target date (${deadline.toISOString().slice(0, 10)}) has already elapsed with ${remainingTasks.length} incomplete tasks (${requiredWorkMinutes} min remaining). Immediate replanning needed.`,
        inputs: {
          deadlineDate: deadline.toISOString(),
          totalRemainingWorkHours: Number((requiredWorkMinutes / 60).toFixed(1)),
          availableWorkingHours: 0,
          calendarMeetingHours: 0,
          slackHours: -Number((requiredWorkMinutes / 60).toFixed(1)),
          hasBlockingDependencies,
        },
        recommendations: [
          "Extend target date to accommodate remaining work",
          "Re-evaluate scope and mark completed or cancelled sub-tasks",
        ],
      });
      continue;
    }

    const { availableMinutes, meetingMinutes } = calculateAvailableWorkMinutes(now, deadline);
    const slackMinutes = availableMinutes - requiredWorkMinutes;
    const bufferPercentage =
      availableMinutes > 0 ? Math.round((slackMinutes / availableMinutes) * 100) : -100;

    let riskLevel: RiskLevel = "ON_TRACK";
    const recommendations: string[] = [];
    let reasoning = "";

    const reqHours = Number((requiredWorkMinutes / 60).toFixed(1));
    const availHours = Number((availableMinutes / 60).toFixed(1));
    const meetHours = Number((meetingMinutes / 60).toFixed(1));
    const slackHours = Number((slackMinutes / 60).toFixed(1));

    if (slackMinutes < 0) {
      riskLevel = "CRITICAL";
      reasoning = `Deficit of ${Math.abs(slackMinutes)} min (${Math.abs(slackHours)}h). Required work (${reqHours}h) exceeds available working capacity (${availHours}h) before deadline ${deadline.toISOString().slice(0, 10)}. Calendar commitments consume ${meetHours}h.`;
      recommendations.push(`Extend goal target date by at least ${Math.ceil(Math.abs(slackMinutes) / 60)} hours`);
      recommendations.push("Reschedule low-priority tasks or reduce estimated durations");
      recommendations.push("Reschedule non-critical calendar meetings to free up focus blocks");
    } else if (slackMinutes < requiredWorkMinutes * 0.25 || (hasBlockingDependencies && slackMinutes < requiredWorkMinutes * 0.4)) {
      riskLevel = "HIGH_RISK";
      reasoning = `Tight safety margin: only ${slackMinutes} min (${slackHours}h, ${bufferPercentage}% slack) buffer remaining for ${reqHours}h of work before ${deadline.toISOString().slice(0, 10)}. Any delay or unexpected meeting will breach deadline.`;
      recommendations.push("Schedule milestone tasks in today's and tomorrow's active plans");
      recommendations.push("Block calendar to protect remaining free working hours");
    } else if (slackMinutes < requiredWorkMinutes * 0.6) {
      riskLevel = "MODERATE_RISK";
      reasoning = `Moderate buffer of ${slackMinutes} min (${slackHours}h, ${bufferPercentage}% slack) across available working hours before ${deadline.toISOString().slice(0, 10)}.`;
      recommendations.push("Queue tasks evenly across upcoming days using the planner");
    } else {
      riskLevel = "ON_TRACK";
      reasoning = `Comfortable buffer: ${slackHours}h slack margin (${bufferPercentage}% slack) with ${availHours}h available capacity for ${reqHours}h required work.`;
      recommendations.push("Maintain current execution schedule");
    }

    riskItems.push({
      id: goal.id,
      type: "GOAL",
      title: goal.title,
      deadline: deadline.toISOString(),
      riskLevel,
      requiredWorkMinutes,
      availableWorkMinutes: availableMinutes,
      slackMinutes,
      bufferPercentage,
      remainingTaskCount: remainingTasks.length,
      reasoning,
      inputs: {
        deadlineDate: deadline.toISOString(),
        totalRemainingWorkHours: reqHours,
        availableWorkingHours: availHours,
        calendarMeetingHours: meetHours,
        slackHours,
        hasBlockingDependencies,
      },
      recommendations,
    });
  }

  // 4. Analyze Standalone Tasks with Deadlines
  const standaloneTasks = await prisma.task.findMany({
    where: {
      userId,
      goalId: null, // Standalone tasks not already accounted for in goals
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      deadline: { not: null, lte: horizon },
    },
    orderBy: { deadline: "asc" },
  });

  for (const task of standaloneTasks) {
    if (!task.deadline) continue;

    const deadline = task.deadline;
    const requiredWorkMinutes = task.duration;
    const hasBlockingDependencies = task.dependencies.length > 0;

    if (deadline < now) {
      riskItems.push({
        id: task.id,
        type: "TASK",
        title: task.title,
        deadline: deadline.toISOString(),
        riskLevel: "CRITICAL",
        requiredWorkMinutes,
        availableWorkMinutes: 0,
        slackMinutes: -requiredWorkMinutes,
        bufferPercentage: -100,
        remainingTaskCount: 1,
        reasoning: `Task deadline (${deadline.toISOString()}) has elapsed and task remains incomplete.`,
        inputs: {
          deadlineDate: deadline.toISOString(),
          totalRemainingWorkHours: Number((requiredWorkMinutes / 60).toFixed(1)),
          availableWorkingHours: 0,
          calendarMeetingHours: 0,
          slackHours: -Number((requiredWorkMinutes / 60).toFixed(1)),
          hasBlockingDependencies,
        },
        recommendations: ["Reschedule task to a future date or complete immediately"],
      });
      continue;
    }

    const { availableMinutes, meetingMinutes } = calculateAvailableWorkMinutes(now, deadline);
    const slackMinutes = availableMinutes - requiredWorkMinutes;
    const bufferPercentage =
      availableMinutes > 0 ? Math.round((slackMinutes / availableMinutes) * 100) : -100;

    const reqHours = Number((requiredWorkMinutes / 60).toFixed(1));
    const availHours = Number((availableMinutes / 60).toFixed(1));
    const meetHours = Number((meetingMinutes / 60).toFixed(1));
    const slackHours = Number((slackMinutes / 60).toFixed(1));

    let riskLevel: RiskLevel = "ON_TRACK";
    let reasoning = "";
    const recommendations: string[] = [];

    if (slackMinutes < 0) {
      riskLevel = "CRITICAL";
      reasoning = `Deficit of ${Math.abs(slackMinutes)} min. Task requires ${reqHours}h but only ${availHours}h free work hours remain before deadline (${meetHours}h occupied by calendar meetings).`;
      recommendations.push("Extend deadline or re-prioritize over other tasks");
    } else if (slackMinutes < requiredWorkMinutes * 0.3) {
      riskLevel = "HIGH_RISK";
      reasoning = `Urgent: only ${slackMinutes} min slack available before deadline.`;
      recommendations.push("Schedule this task in the very next open slot");
    } else if (slackMinutes < requiredWorkMinutes * 0.7) {
      riskLevel = "MODERATE_RISK";
      reasoning = `Moderate margin of ${slackMinutes} min (${slackHours}h) before deadline.`;
      recommendations.push("Keep prioritized in upcoming plan");
    } else {
      riskLevel = "ON_TRACK";
      reasoning = `On track with ${slackHours}h buffer before deadline.`;
      recommendations.push("Proceed as planned");
    }

    riskItems.push({
      id: task.id,
      type: "TASK",
      title: task.title,
      deadline: deadline.toISOString(),
      riskLevel,
      requiredWorkMinutes,
      availableWorkMinutes: availableMinutes,
      slackMinutes,
      bufferPercentage,
      remainingTaskCount: 1,
      reasoning,
      inputs: {
        deadlineDate: deadline.toISOString(),
        totalRemainingWorkHours: reqHours,
        availableWorkingHours: availHours,
        calendarMeetingHours: meetHours,
        slackHours,
        hasBlockingDependencies,
      },
      recommendations,
    });
  }

  // Sort items: CRITICAL first, then HIGH_RISK, then MODERATE_RISK, then ON_TRACK
  const orderMap: Record<RiskLevel, number> = {
    CRITICAL: 0,
    HIGH_RISK: 1,
    MODERATE_RISK: 2,
    ON_TRACK: 3,
  };
  riskItems.sort((a, b) => orderMap[a.riskLevel] - orderMap[b.riskLevel]);

  const critical = riskItems.filter((r) => r.riskLevel === "CRITICAL").length;
  const highRisk = riskItems.filter((r) => r.riskLevel === "HIGH_RISK").length;
  const moderateRisk = riskItems.filter((r) => r.riskLevel === "MODERATE_RISK").length;
  const onTrack = riskItems.filter((r) => r.riskLevel === "ON_TRACK").length;

  const overallStatus = critical > 0 ? "RED" : highRisk > 0 ? "AMBER" : "GREEN";

  return {
    evaluatedAt: now.toISOString(),
    summary: {
      totalEvaluated: riskItems.length,
      critical,
      highRisk,
      moderateRisk,
      onTrack,
      overallStatus,
    },
    risks: riskItems,
  };
}
