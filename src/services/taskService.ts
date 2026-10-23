import { TaskPriority, TaskStatus, Task } from "@prisma/client";
import { prisma, resolveUserId } from "../db/client.js";
import { getDayRangeInTimezone } from "../utils/timezone.js";

export interface CreateTaskInput {
  userId?: string;
  title: string;
  description?: string | null;
  duration?: number;
  priority?: TaskPriority;
  deadline?: string | Date | null;
  tags?: string[];
  dependencies?: string[];
  allowSplitting?: boolean;
}

export interface ListTasksFilter {
  userId?: string;
  status?: TaskStatus | "ALL";
  priority?: TaskPriority;
  tag?: string;
  date?: string; // YYYY-MM-DD
}

export interface UpdateTaskInput {
  id: string;
  userId?: string;
  title?: string;
  description?: string | null;
  duration?: number;
  priority?: TaskPriority;
  deadline?: string | Date | null;
  status?: TaskStatus;
  tags?: string[];
  dependencies?: string[];
  allowSplitting?: boolean;
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task with id '${taskId}' not found or access denied.`);
    this.name = "TaskNotFoundError";
  }
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const targetUserId = await resolveUserId(input.userId);

  if (!input.title || typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new Error("Task title is required and cannot be empty.");
  }
  if (input.title.length > 500) {
    throw new Error("Task title cannot exceed 500 characters.");
  }

  const duration = input.duration ?? 30;
  if (duration <= 0 || duration > 1440) {
    throw new Error("Task duration must be a positive integer between 1 and 1440 minutes.");
  }

  const deadlineDate = input.deadline ? new Date(input.deadline) : null;
  if (deadlineDate && isNaN(deadlineDate.getTime())) {
    throw new Error("Invalid deadline format. Please provide a valid ISO-8601 date string.");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        userId: targetUserId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        duration,
        priority: input.priority ?? TaskPriority.MEDIUM,
        deadline: deadlineDate,
        status: TaskStatus.PENDING,
        tags: input.tags ?? [],
        dependencies: input.dependencies ?? [],
        allowSplitting: input.allowSplitting ?? false,
      },
    });

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "CREATE_TASK",
        entityType: "TASK",
        entityId: task.id,
        payload: {
          title: task.title,
          priority: task.priority,
          duration: task.duration,
          deadline: task.deadline?.toISOString() ?? null,
          tags: task.tags,
          dependencies: task.dependencies,
          allowSplitting: task.allowSplitting,
        },
      },
    });

    return task;
  });
}

export async function listTasks(filter: ListTasksFilter = {}): Promise<Task[]> {
  const targetUserId = await resolveUserId(filter.userId);

  const whereClause: Record<string, unknown> = {
    userId: targetUserId, // Strict ownership enforcement
  };

  if (filter.status && filter.status !== "ALL") {
    whereClause.status = filter.status;
  }

  if (filter.priority) {
    whereClause.priority = filter.priority;
  }

  if (filter.tag) {
    whereClause.tags = { has: filter.tag };
  }

  if (filter.date) {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { timezone: true },
    });
    const tz = user?.timezone ?? "Asia/Kolkata";
    const range = getDayRangeInTimezone(filter.date, tz);
    whereClause.deadline = {
      gte: range.start,
      lte: range.end,
    };
  }

  return prisma.task.findMany({
    where: whereClause,
    orderBy: [
      { priority: "desc" },
      { deadline: "asc" },
      { createdAt: "desc" },
    ],
  });
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const targetUserId = await resolveUserId(input.userId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({
      where: {
        id: input.id,
        userId: targetUserId, // Strict ownership check
      },
    });

    if (!existing) {
      throw new TaskNotFoundError(input.id);
    }

    const dataToUpdate: Record<string, unknown> = {};

    if (input.title !== undefined) {
      dataToUpdate.title = input.title.trim();
    }
    if (input.description !== undefined) {
      dataToUpdate.description = input.description?.trim() || null;
    }
    if (input.duration !== undefined) {
      if (input.duration <= 0) {
        throw new Error("Duration must be a positive integer.");
      }
      dataToUpdate.duration = input.duration;
    }
    if (input.priority !== undefined) {
      dataToUpdate.priority = input.priority;
    }
    if (input.deadline !== undefined) {
      if (input.deadline === null) {
        dataToUpdate.deadline = null;
      } else {
        const d = new Date(input.deadline);
        if (isNaN(d.getTime())) {
          throw new Error("Invalid deadline format.");
        }
        dataToUpdate.deadline = d;
      }
    }
    if (input.tags !== undefined) {
      dataToUpdate.tags = input.tags;
    }
    if (input.dependencies !== undefined) {
      dataToUpdate.dependencies = input.dependencies;
    }
    if (input.allowSplitting !== undefined) {
      dataToUpdate.allowSplitting = input.allowSplitting;
    }
    if (input.status !== undefined) {
      dataToUpdate.status = input.status;
      if (input.status === TaskStatus.COMPLETED && existing.status !== TaskStatus.COMPLETED) {
        dataToUpdate.completedAt = new Date();
      } else if (input.status !== TaskStatus.COMPLETED) {
        dataToUpdate.completedAt = null;
      }
    }

    const updated = await tx.task.update({
      where: { id: input.id },
      data: dataToUpdate,
    });

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "UPDATE_TASK",
        entityType: "TASK",
        entityId: updated.id,
        payload: {
          updatedFields: Object.keys(dataToUpdate),
          status: updated.status,
        },
      },
    });

    return updated;
  });
}

export async function completeTask(id: string, userId?: string): Promise<Task> {
  return updateTask({
    id,
    userId,
    status: TaskStatus.COMPLETED,
  });
}

export async function deleteTask(id: string, userId?: string): Promise<{ success: boolean; id: string }> {
  const targetUserId = await resolveUserId(userId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({
      where: {
        id,
        userId: targetUserId, // Strict ownership check
      },
    });

    if (!existing) {
      throw new TaskNotFoundError(id);
    }

    // Delete dependent plan items if any
    await tx.planItem.deleteMany({
      where: { taskId: id },
    });

    await tx.task.delete({
      where: { id },
    });

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "DELETE_TASK",
        entityType: "TASK",
        entityId: id,
        payload: { title: existing.title },
      },
    });

    return { success: true, id };
  });
}
