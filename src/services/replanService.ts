import { PlanStatus, TaskStatus } from "@prisma/client";
import { prisma, resolveUserId } from "../db/client.js";
import { getDayContext } from "./contextService.js";
import { replanDay, ReplanInput, ReplanResult } from "../planner/replanner.js";
import { comparePlans, PlanComparisonResult } from "../planner/comparator.js";
import { PlannerEvent, PlannerTask, UnscheduledTaskReport } from "../planner/types.js";

export class StalePlanVersionError extends Error {
  constructor(expected: number, actual: number) {
    super(
      `Plan version conflict: expected version ${expected}, but proposal is version ${actual}. Please review the updated plan preview.`
    );
    this.name = "StalePlanVersionError";
  }
}

export class ConcurrentPlanModificationError extends Error {
  constructor(message: string) {
    super(`Concurrent plan modification: ${message}`);
    this.name = "ConcurrentPlanModificationError";
  }
}

export class PlanNotFoundError extends Error {
  constructor(planId: string) {
    super(`Plan with id '${planId}' was not found.`);
    this.name = "PlanNotFoundError";
  }
}

export class InvalidPlanStateError extends Error {
  constructor(planId: string, status: string) {
    super(`Plan '${planId}' cannot be committed because it is in '${status}' state.`);
    this.name = "InvalidPlanStateError";
  }
}

export interface PreviewReplanOptions {
  date: string;
  userId?: string;
  disruptions?: {
    delayedEvents?: Array<{
      eventId: string;
      delayMinutes?: number;
      newStartTime?: string;
      newEndTime?: string;
      title?: string;
    }>;
    extendedTasks?: Array<{
      taskId: string;
      extendedMinutes: number;
    }>;
    currentTime?: string;
    reason?: string;
  };
  constraints?: {
    preservedTaskIds?: string[];
    pinnedTaskIds?: string[];
  };
  whatIf?: boolean;
}

export interface PreviewReplanResult {
  proposedPlanId: string;
  proposedVersion: number;
  basePlanId: string | null;
  baseVersion: number | null;
  diff: PlanComparisonResult;
  tradeOffs: string[];
  unscheduledTasks: UnscheduledTaskReport[];
  replanReason: string;
  isFeasible: boolean;
  metrics: unknown;
  isWhatIf: boolean;
}

export async function previewReplan(
  options: PreviewReplanOptions
): Promise<PreviewReplanResult> {
  const targetUserId = await resolveUserId(options.userId);
  const { date } = options;

  // 1. Fetch current active plan for comparison (or fallback to latest plan)
  const activePlan = await prisma.plan.findFirst({
    where: {
      userId: targetUserId,
      date,
      status: PlanStatus.ACTIVE,
    },
    orderBy: { version: "desc" },
    include: {
      items: { orderBy: { order: "asc" } },
    },
  });

  const basePlan =
    activePlan ??
    (await prisma.plan.findFirst({
      where: { userId: targetUserId, date },
      orderBy: { version: "desc" },
      include: {
        items: { orderBy: { order: "asc" } },
      },
    }));

  const baseItems = basePlan ? basePlan.items : [];

  // 2. Fetch day context (tasks, events, preferences)
  const context = await getDayContext(date, targetUserId);

  // Exclude completed or cancelled tasks
  const tasks = await prisma.task.findMany({
    where: {
      userId: targetUserId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
    },
  });

  const plannerTasks: PlannerTask[] = tasks.map((t) => ({
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

  const plannerEvents: PlannerEvent[] = context.fixedEvents.map((e) => ({
    id: e.id,
    title: e.title,
    startTime: e.startTime,
    endTime: e.endTime,
    isAllDay: e.isAllDay,
    location: e.location,
  }));

  // 3. Deterministic replanning calculation
  const replanInput: ReplanInput = {
    date,
    currentPlanItems: baseItems,
    tasks: plannerTasks,
    fixedEvents: plannerEvents,
    preferences: {
      focusMinutes: context.preferences.focusMinutes,
      breakMinutes: context.preferences.breakMinutes,
      workStartTime: context.preferences.workStartTime,
      workEndTime: context.preferences.workEndTime,
      bufferMinutes: context.preferences.bufferMinutes,
      timezone: context.timezone,
    },
    disruptions: options.disruptions,
    constraints: options.constraints,
  };

  const replanResult = replanDay(replanInput);

  // 4. Save proposal as PROPOSED without modifying ACTIVE schedule
  const latestPlan = await prisma.plan.findFirst({
    where: { userId: targetUserId, date },
    orderBy: { version: "desc" },
  });
  const nextVersion = (latestPlan?.version ?? 0) + 1;

  const proposedPlan = await prisma.$transaction(async (tx) => {
    const created = await tx.plan.create({
      data: {
        userId: targetUserId,
        date,
        status: PlanStatus.PROPOSED,
        version: nextVersion,
        parentPlanId: basePlan ? basePlan.id : null,
        replanReason: replanResult.replanReason,
        items: {
          create: replanResult.schedule.scheduledItems.map((item) => ({
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
      include: {
        items: { orderBy: { order: "asc" } },
      },
    });

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: options.whatIf ? "WHAT_IF_PREVIEW" : "PREVIEW_REPLAN",
        entityType: "PLAN",
        entityId: created.id,
        payload: {
          date,
          proposedVersion: created.version,
          basePlanId: basePlan?.id || null,
          baseVersion: basePlan?.version || null,
          replanReason: replanResult.replanReason,
          totalAdded: replanResult.diff.summary.totalAdded,
          totalMoved: replanResult.diff.summary.totalMoved,
          totalRemoved: replanResult.diff.summary.totalRemoved,
          totalUnchanged: replanResult.diff.summary.totalUnchanged,
          tradeOffs: replanResult.tradeOffs,
          isWhatIf: !!options.whatIf,
        },
      },
    });

    return created;
  });

  return {
    proposedPlanId: proposedPlan.id,
    proposedVersion: proposedPlan.version,
    basePlanId: basePlan?.id || null,
    baseVersion: basePlan?.version || null,
    diff: replanResult.diff,
    tradeOffs: replanResult.tradeOffs,
    unscheduledTasks: replanResult.schedule.unscheduledTasks,
    replanReason: replanResult.replanReason,
    isFeasible: replanResult.schedule.isFeasible,
    metrics: replanResult.schedule.metrics,
    isWhatIf: !!options.whatIf,
  };
}

export async function comparePlansService(options: {
  basePlanId: string;
  targetPlanId: string;
  userId?: string;
}): Promise<PlanComparisonResult> {
  const targetUserId = await resolveUserId(options.userId);

  const [base, target] = await Promise.all([
    prisma.plan.findFirst({
      where: { id: options.basePlanId, userId: targetUserId },
      include: { items: { orderBy: { order: "asc" } } },
    }),
    prisma.plan.findFirst({
      where: { id: options.targetPlanId, userId: targetUserId },
      include: { items: { orderBy: { order: "asc" } } },
    }),
  ]);

  if (!base) throw new PlanNotFoundError(options.basePlanId);
  if (!target) throw new PlanNotFoundError(options.targetPlanId);

  return comparePlans(base.items, target.items);
}

export interface CommitPlanOptions {
  planId: string;
  expectedVersion?: number;
  userId?: string;
}

export async function commitPlan(options: CommitPlanOptions) {
  const targetUserId = await resolveUserId(options.userId);

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.plan.findFirst({
      where: { id: options.planId, userId: targetUserId },
      include: { items: true },
    });

    if (!proposal) {
      throw new PlanNotFoundError(options.planId);
    }

    // 1. Idempotency / Retry safety (Requirement 10)
    if (proposal.status === PlanStatus.ACTIVE) {
      return {
        success: true,
        message: "Plan already committed.",
        planId: proposal.id,
        version: proposal.version,
        status: PlanStatus.ACTIVE,
        idempotent: true,
      };
    }

    // 2. State verification
    if (proposal.status !== PlanStatus.PROPOSED && proposal.status !== PlanStatus.DRAFT) {
      throw new InvalidPlanStateError(proposal.id, proposal.status);
    }

    // 3. Stale version verification (Requirement 7 & 8)
    if (options.expectedVersion !== undefined && proposal.version !== options.expectedVersion) {
      throw new StalePlanVersionError(options.expectedVersion, proposal.version);
    }

    // 4. Concurrency check (Requirement 8)
    if (proposal.parentPlanId) {
      const currentActive = await tx.plan.findFirst({
        where: {
          userId: targetUserId,
          date: proposal.date,
          status: PlanStatus.ACTIVE,
        },
      });

      if (currentActive && currentActive.id !== proposal.parentPlanId) {
        throw new ConcurrentPlanModificationError(
          `The active plan has changed from ${proposal.parentPlanId} to ${currentActive.id} (version ${currentActive.version}). Please review an updated replan.`
        );
      }
    }

    // 5. Update prior ACTIVE plans to SUPERSEDED
    await tx.plan.updateMany({
      where: {
        userId: targetUserId,
        date: proposal.date,
        status: PlanStatus.ACTIVE,
        id: { not: proposal.id },
      },
      data: { status: PlanStatus.SUPERSEDED },
    });

    // 6. Set proposal to ACTIVE
    const committed = await tx.plan.update({
      where: { id: proposal.id },
      data: { status: PlanStatus.ACTIVE },
    });

    // 7. Record ActionHistory
    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "COMMIT_PLAN",
        entityType: "PLAN",
        entityId: committed.id,
        payload: {
          date: committed.date,
          version: committed.version,
          parentPlanId: proposal.parentPlanId,
          replanReason: proposal.replanReason,
          itemCount: proposal.items.length,
          committedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: `Plan version ${committed.version} successfully committed.`,
      planId: committed.id,
      version: committed.version,
      status: committed.status,
    };
  });
}

export interface RejectPlanOptions {
  planId: string;
  reason?: string;
  userId?: string;
}

export async function rejectPlan(options: RejectPlanOptions) {
  const targetUserId = await resolveUserId(options.userId);

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.plan.findFirst({
      where: { id: options.planId, userId: targetUserId },
    });

    if (!proposal) {
      throw new PlanNotFoundError(options.planId);
    }

    if (proposal.status === PlanStatus.ACTIVE) {
      throw new Error(`Cannot reject an already committed ACTIVE plan. Use rollback instead.`);
    }

    if (proposal.status === PlanStatus.REJECTED) {
      return {
        success: true,
        message: "Plan proposal already rejected.",
        planId: proposal.id,
        status: PlanStatus.REJECTED,
      };
    }

    const updated = await tx.plan.update({
      where: { id: proposal.id },
      data: {
        status: PlanStatus.REJECTED,
        replanReason: options.reason || proposal.replanReason,
      },
    });

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "REJECT_PLAN",
        entityType: "PLAN",
        entityId: updated.id,
        payload: {
          date: updated.date,
          version: updated.version,
          reason: options.reason || "Rejected by user.",
          rejectedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: `Plan proposal version ${updated.version} rejected. Previous schedule remains active.`,
      planId: updated.id,
      version: updated.version,
      status: PlanStatus.REJECTED,
    };
  });
}

export interface RollbackPlanOptions {
  date: string;
  targetVersion?: number;
  reason?: string;
  userId?: string;
}

export async function rollbackPlan(options: RollbackPlanOptions) {
  const targetUserId = await resolveUserId(options.userId);

  return prisma.$transaction(async (tx) => {
    const currentActive = await tx.plan.findFirst({
      where: {
        userId: targetUserId,
        date: options.date,
        status: PlanStatus.ACTIVE,
      },
      orderBy: { version: "desc" },
    });

    if (!currentActive) {
      throw new Error(`No active plan found for date '${options.date}' to rollback.`);
    }

    let targetPlan;
    if (options.targetVersion) {
      targetPlan = await tx.plan.findFirst({
        where: {
          userId: targetUserId,
          date: options.date,
          version: options.targetVersion,
        },
      });
    } else {
      targetPlan = await tx.plan.findFirst({
        where: {
          userId: targetUserId,
          date: options.date,
          status: PlanStatus.SUPERSEDED,
          version: { lt: currentActive.version },
        },
        orderBy: { version: "desc" },
      });
    }

    if (!targetPlan) {
      throw new Error(
        `No prior plan version found to rollback to for date '${options.date}'.`
      );
    }

    // Mark current active as SUPERSEDED
    await tx.plan.update({
      where: { id: currentActive.id },
      data: { status: PlanStatus.SUPERSEDED },
    });

    // Restore target plan to ACTIVE
    const restored = await tx.plan.update({
      where: { id: targetPlan.id },
      data: { status: PlanStatus.ACTIVE },
    });

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "ROLLBACK_PLAN",
        entityType: "PLAN",
        entityId: restored.id,
        payload: {
          date: options.date,
          rolledBackFromVersion: currentActive.version,
          restoredVersion: restored.version,
          reason: options.reason || "User requested plan rollback.",
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: `Successfully rolled back to plan version ${restored.version}.`,
      planId: restored.id,
      version: restored.version,
      status: restored.status,
    };
  });
}

export async function getPlanHistory(date: string, userId?: string) {
  const targetUserId = await resolveUserId(userId);

  const plans = await prisma.plan.findMany({
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

  const activePlan = plans.find((p) => p.status === PlanStatus.ACTIVE);

  return {
    date,
    totalVersions: plans.length,
    currentActiveVersion: activePlan?.version || null,
    currentActivePlanId: activePlan?.id || null,
    history: plans.map((p) => ({
      id: p.id,
      version: p.version,
      status: p.status,
      parentPlanId: p.parentPlanId,
      replanReason: p.replanReason,
      itemCount: p.items.length,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      items: p.items,
    })),
  };
}
