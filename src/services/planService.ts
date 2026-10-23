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
  const existingPlan = await prisma.plan.findFirst({
    where: {
      userId: targetUserId,
      date,
      status: { in: [PlanStatus.ACTIVE, PlanStatus.COMPLETED] },
    },
    orderBy: { version: "desc" },
    include: {
      items: true,
    },
  });

  if (existingPlan && !overwriteApproved) {
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

  // 4. Persist plan in transaction with batch nested item creation
  const plan = await prisma.$transaction(
    async (tx) => {
      // If regenerating and an existing plan was found, clean up if it was a draft
      const latestPlan = await tx.plan.findFirst({
        where: { userId: targetUserId, date },
        orderBy: { version: "desc" },
      });

      let nextVersion = 1;
      if (latestPlan) {
        if (latestPlan.status === PlanStatus.DRAFT) {
          await tx.planItem.deleteMany({
            where: { planId: latestPlan.id },
          });
          await tx.plan.delete({
            where: { id: latestPlan.id },
          });
          nextVersion = latestPlan.version;
        } else {
          nextVersion = latestPlan.version + 1;
        }
      }

      const newPlan = await tx.plan.create({
        data: {
          userId: targetUserId,
          date,
          status: PlanStatus.DRAFT,
          version: nextVersion,
          items: {
            create: scheduleResult.scheduledItems.map((item) => ({
              order: item.order,
              itemType: item.itemType,
              title: item.title,
              startTime: item.startTime,
              endTime: item.endTime,
              taskId: item.taskId || null,
              calendarEventId: item.calendarEventId || null,
            })),
          },
        },
      });

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
            metrics: scheduleResult.metrics as any,
          },
        },
      });

      return newPlan;
    },
    { maxWait: 10000, timeout: 20000 }
  );

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

  let plan = await prisma.plan.findFirst({
    where: {
      userId: targetUserId,
      date,
      status: PlanStatus.ACTIVE,
    },
    orderBy: { version: "desc" },
    include: {
      items: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!plan) {
    plan = await prisma.plan.findFirst({
      where: {
        userId: targetUserId,
        date,
      },
      orderBy: { version: "desc" },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    });
  }

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
      include: { items: { orderBy: { order: "asc" } } },
    });

    if (!existing) {
      throw new Error(`Plan with id '${planId}' not found for user.`);
    }

    // Schedule Integrity Guardrail: Validate schedule before approval
    for (let i = 0; i < existing.items.length; i++) {
      const cur = existing.items[i];
      if (new Date(cur.endTime).getTime() <= new Date(cur.startTime).getTime()) {
        throw new Error(`Invalid schedule: item '${cur.title}' has invalid start/end timestamps.`);
      }
      if (i < existing.items.length - 1) {
        const next = existing.items[i + 1];
        if (new Date(cur.endTime).getTime() > new Date(next.startTime).getTime()) {
          throw new Error(`Invalid schedule: overlapping items detected between '${cur.title}' and '${next.title}'.`);
        }
      }
    }

    // Mark any existing active plans as superseded
    await tx.plan.updateMany({
      where: {
        userId: targetUserId,
        date: existing.date,
        status: PlanStatus.ACTIVE,
        id: { not: planId },
      },
      data: { status: PlanStatus.SUPERSEDED },
    });

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
