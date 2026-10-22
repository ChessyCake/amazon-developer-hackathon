import { PlanStatus, PlanItemType, TaskStatus } from "@prisma/client";
import { prisma, resolveUserId } from "../db/client.js";
import { getDayContext } from "./contextService.js";
import { scheduleDay } from "../planner/scheduler.js";
import { PlannerInput, PlannerResult, PlannerTask } from "../planner/types.js";

export class ApprovedPlanExistsError extends Error {
  constructor(date: string) {
    super(
      `An approved (ACTIVE) plan already exists for date '${date}'. Generating a new plan would overwrite approved commitments. Pass overwriteApproved=true to force regeneration.`
    );
    this.name = "ApprovedPlanExistsError";
  }
}

export interface GeneratePlanOptions {
  date: string;
  userId?: string;
  overwriteApproved?: boolean;
}

export async function generateAndSavePlan(
  options: GeneratePlanOptions
): Promise<{ planId: string; status: PlanStatus; schedule: PlannerResult }> {
  const targetUserId = await resolveUserId(options.userId);
  const { date, overwriteApproved = false } = options;

  // 1. Check for existing approved plan
  const existingPlan = await prisma.plan.findUnique({
    where: {
      userId_date: {
        userId: targetUserId,
        date,
      },
    },
    include: {
      items: true,
    },
  });

  if (
    existingPlan &&
    (existingPlan.status === PlanStatus.ACTIVE || existingPlan.status === PlanStatus.COMPLETED) &&
    !overwriteApproved
  ) {
    throw new ApprovedPlanExistsError(date);
  }

  // 2. Fetch day context (tasks, events, preferences)
  const context = await getDayContext(date, targetUserId);

  // Fetch full task details including dependencies and allowSplitting
  const fullTasks = await prisma.task.findMany({
    where: {
      userId: targetUserId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
    },
  });

  const plannerTasks: PlannerTask[] = fullTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    duration: t.duration,
    priority: t.priority,
    deadline: t.deadline,
    status: t.status,
    tags: t.tags,
    dependencies: t.dependencies,
    allowSplitting: t.allowSplitting,
  }));

  const plannerInput: PlannerInput = {
    date,
    userId: targetUserId,
    tasks: plannerTasks,
    fixedEvents: context.fixedEvents.map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      isAllDay: e.isAllDay,
      location: e.location,
    })),
    preferences: {
      focusMinutes: context.preferences.focusMinutes,
      breakMinutes: context.preferences.breakMinutes,
      workStartTime: context.preferences.workStartTime,
      workEndTime: context.preferences.workEndTime,
      bufferMinutes: context.preferences.bufferMinutes,
      timezone: context.timezone,
    },
  };

  // 3. Invoke deterministic scheduler
  const scheduleResult = scheduleDay(plannerInput);

  // 4. Persist plan in transaction
  const plan = await prisma.$transaction(async (tx) => {
    // Delete existing plan items if re-generating for this date
    if (existingPlan) {
      await tx.planItem.deleteMany({
        where: { planId: existingPlan.id },
      });
      await tx.plan.delete({
        where: { id: existingPlan.id },
      });
    }

    const newPlan = await tx.plan.create({
      data: {
        userId: targetUserId,
        date,
        status: PlanStatus.DRAFT,
      },
    });

    for (const item of scheduleResult.scheduledItems) {
      await tx.planItem.create({
        data: {
          planId: newPlan.id,
          order: item.order,
          itemType: item.itemType,
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
          taskId: item.taskId || null,
          calendarEventId: item.calendarEventId || null,
        },
      });
    }

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "GENERATE_PLAN",
        entityType: "PLAN",
        entityId: newPlan.id,
        payload: {
          date,
          status: newPlan.status,
          scheduledCount: scheduleResult.scheduledItems.length,
          unscheduledCount: scheduleResult.unscheduledTasks.length,
          isFeasible: scheduleResult.isFeasible,
          metrics: scheduleResult.metrics,
        },
      },
    });

    return newPlan;
  });

  return {
    planId: plan.id,
    status: plan.status,
    schedule: scheduleResult,
  };
}

export async function getPlan(
  date: string,
  userId?: string
): Promise<{ plan: unknown | null }> {
  const targetUserId = await resolveUserId(userId);

  const plan = await prisma.plan.findUnique({
    where: {
      userId_date: {
        userId: targetUserId,
        date,
      },
    },
    include: {
      items: {
        orderBy: { order: "asc" },
      },
    },
  });

  return { plan };
}

export async function approvePlan(
  planId: string,
  userId?: string
): Promise<{ success: boolean; plan: unknown }> {
  const targetUserId = await resolveUserId(userId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.plan.findFirst({
      where: {
        id: planId,
        userId: targetUserId,
      },
      include: { items: true },
    });

    if (!existing) {
      throw new Error(`Plan with id '${planId}' not found for user.`);
    }

    const updated = await tx.plan.update({
      where: { id: planId },
      data: { status: PlanStatus.ACTIVE },
    });

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "APPROVE_PLAN",
        entityType: "PLAN",
        entityId: planId,
        payload: {
          date: existing.date,
          status: PlanStatus.ACTIVE,
          itemCount: existing.items.length,
        },
      },
    });

    return { success: true, plan: updated };
  });
}
