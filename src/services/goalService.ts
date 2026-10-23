import { prisma, resolveUserId } from "../db/client.js";
import { GoalStatus, MilestoneStatus, TaskPriority, TaskStatus } from "@prisma/client";

export interface CreateGoalInput {
  userId?: string;
  title: string;
  description?: string;
  targetDate?: string | Date | null;
}

export interface DecomposeTaskInput {
  key?: string;
  title: string;
  description?: string;
  duration: number;
  priority?: TaskPriority;
  deadline?: string | Date | null;
  dependsOnKeys?: string[];
  allowSplitting?: boolean;
  tags?: string[];
}

export interface DecomposeMilestoneInput {
  title: string;
  description?: string;
  targetDate?: string | Date | null;
  order?: number;
  tasks: DecomposeTaskInput[];
}

export interface DecomposeGoalInput {
  goalId: string;
  userId?: string;
  milestones: DecomposeMilestoneInput[];
}

/**
 * Creates a high-level goal for the user.
 */
export async function createGoal(input: CreateGoalInput) {
  const userId = await resolveUserId(input.userId);

  if (!input.title || input.title.trim() === "") {
    throw new Error("Goal title is required");
  }

  const targetDate = input.targetDate ? new Date(input.targetDate) : null;

  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.create({
      data: {
        userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        targetDate,
        status: GoalStatus.ACTIVE,
      },
      include: {
        milestones: true,
        tasks: true,
      },
    });

    await tx.actionHistory.create({
      data: {
        userId,
        actionType: "CREATE_GOAL",
        entityType: "GOAL",
        entityId: goal.id,
        payload: {
          title: goal.title,
          targetDate: goal.targetDate?.toISOString() || null,
        },
      },
    });

    return goal;
  });
}

/**
 * Lists all goals for a user with calculated progress metrics.
 */
export async function listGoals(userIdArg?: string, status?: GoalStatus) {
  const userId = await resolveUserId(userIdArg);

  const where: any = { userId };
  if (status) {
    where.status = status;
  }

  const goals = await prisma.goal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      milestones: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            select: {
              id: true,
              title: true,
              duration: true,
              priority: true,
              deadline: true,
              status: true,
            },
          },
        },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          duration: true,
          priority: true,
          deadline: true,
          status: true,
        },
      },
    },
  });

  return goals.map((goal) => {
    const totalTasks = goal.tasks.length;
    const completedTasks = goal.tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const remainingMinutes = goal.tasks
      .filter((t) => t.status !== TaskStatus.COMPLETED)
      .reduce((acc, t) => acc + t.duration, 0);
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      ...goal,
      totalMilestones: goal.milestones.length,
      totalTasks,
      completedTasks,
      progressPercent,
      remainingMinutes,
    };
  });
}

/**
 * Retrieves a single goal with full milestone and task hierarchy.
 */
export async function getGoal(id: string, userIdArg?: string) {
  const userId = await resolveUserId(userIdArg);

  const goal = await prisma.goal.findFirst({
    where: { id, userId },
    include: {
      milestones: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      tasks: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!goal) {
    throw new Error(`Goal not found with id: ${id}`);
  }

  const totalTasks = goal.tasks.length;
  const completedTasks = goal.tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
  const remainingMinutes = goal.tasks
    .filter((t) => t.status !== TaskStatus.COMPLETED)
    .reduce((acc, t) => acc + t.duration, 0);
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    ...goal,
    totalMilestones: goal.milestones.length,
    totalTasks,
    completedTasks,
    progressPercent,
    remainingMinutes,
  };
}

/**
 * Updates an existing goal.
 */
export async function updateGoal(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    status: GoalStatus;
    targetDate: string | Date | null;
  }>,
  userIdArg?: string
) {
  const userId = await resolveUserId(userIdArg);

  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    throw new Error(`Goal not found with id: ${id}`);
  }

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.targetDate !== undefined) {
    updateData.targetDate = data.targetDate ? new Date(data.targetDate) : null;
  }

  return prisma.goal.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Deletes a goal and cascades milestones and tasks.
 */
export async function deleteGoal(id: string, userIdArg?: string) {
  const userId = await resolveUserId(userIdArg);

  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    throw new Error(`Goal not found with id: ${id}`);
  }

  await prisma.goal.delete({ where: { id } });
  return { success: true, message: `Goal ${id} deleted` };
}

/**
 * Decomposes a goal into milestones and concrete, schedulable tasks.
 * Resolves local task dependencies and links them directly to the scheduler.
 */
export async function decomposeGoal(input: DecomposeGoalInput) {
  const userId = await resolveUserId(input.userId);

  const goal = await prisma.goal.findFirst({
    where: { id: input.goalId, userId },
  });
  if (!goal) {
    throw new Error(`Goal not found with id: ${input.goalId}`);
  }

  if (!input.milestones || input.milestones.length === 0) {
    throw new Error("At least one milestone is required for decomposition");
  }

  return prisma.$transaction(async (tx) => {
    const keyToTaskIdMap = new Map<string, string>();
    const createdMilestones = [];
    const tasksToCreate: Array<{
      milestoneId: string;
      rawTask: DecomposeTaskInput;
    }> = [];

    // 1. Create milestones
    for (let i = 0; i < input.milestones.length; i++) {
      const msInput = input.milestones[i];
      const milestone = await tx.milestone.create({
        data: {
          goalId: goal.id,
          title: msInput.title.trim(),
          description: msInput.description?.trim() || null,
          targetDate: msInput.targetDate ? new Date(msInput.targetDate) : null,
          order: msInput.order ?? i,
          status: MilestoneStatus.PENDING,
        },
      });
      createdMilestones.push(milestone);

      for (const t of msInput.tasks || []) {
        tasksToCreate.push({
          milestoneId: milestone.id,
          rawTask: t,
        });
      }
    }

    // 2. Pre-create tasks to establish IDs for dependency wiring
    const createdTasks = [];
    for (const item of tasksToCreate) {
      const raw = item.rawTask;
      const task = await tx.task.create({
        data: {
          userId,
          goalId: goal.id,
          milestoneId: item.milestoneId,
          title: raw.title.trim(),
          description: raw.description?.trim() || null,
          duration: Math.max(5, raw.duration || 30),
          priority: raw.priority || TaskPriority.MEDIUM,
          deadline: raw.deadline ? new Date(raw.deadline) : goal.targetDate,
          status: TaskStatus.PENDING,
          allowSplitting: raw.allowSplitting ?? false,
          tags: raw.tags || ["goal", goal.title.toLowerCase().replace(/\s+/g, "-")],
          dependencies: [], // wired in next step
        },
      });

      if (raw.key) {
        keyToTaskIdMap.set(raw.key, task.id);
      }
      // Also map title for convenience
      keyToTaskIdMap.set(raw.title.trim().toLowerCase(), task.id);
      createdTasks.push({ task, raw });
    }

    // 3. Resolve and update dependencies
    const finalTasks = [];
    for (const { task, raw } of createdTasks) {
      if (raw.dependsOnKeys && raw.dependsOnKeys.length > 0) {
        const resolvedDeps: string[] = [];
        for (const depKey of raw.dependsOnKeys) {
          if (keyToTaskIdMap.has(depKey)) {
            resolvedDeps.push(keyToTaskIdMap.get(depKey)!);
          } else if (keyToTaskIdMap.has(depKey.trim().toLowerCase())) {
            resolvedDeps.push(keyToTaskIdMap.get(depKey.trim().toLowerCase())!);
          } else {
            // Assume it may already be an existing task ID
            resolvedDeps.push(depKey);
          }
        }

        const updatedTask = await tx.task.update({
          where: { id: task.id },
          data: { dependencies: resolvedDeps },
        });
        finalTasks.push(updatedTask);
      } else {
        finalTasks.push(task);
      }
    }

    // Log action
    await tx.actionHistory.create({
      data: {
        userId,
        actionType: "DECOMPOSE_GOAL",
        entityType: "GOAL",
        entityId: goal.id,
        payload: {
          goalTitle: goal.title,
          milestonesCount: createdMilestones.length,
          tasksCount: finalTasks.length,
        },
      },
    });

    return {
      goalId: goal.id,
      goalTitle: goal.title,
      milestones: createdMilestones,
      tasks: finalTasks,
    };
  });
}
