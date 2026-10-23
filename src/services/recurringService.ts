import { prisma, resolveUserId } from "../db/client.js";
import { RecurrenceFrequency, TaskPriority, TaskStatus } from "@prisma/client";

export interface CreateRecurringRuleInput {
  userId?: string;
  title: string;
  description?: string;
  duration?: number;
  priority?: TaskPriority;
  frequency?: RecurrenceFrequency;
  daysOfWeek?: number[];
  tags?: string[];
  startDate?: string | Date;
  endDate?: string | Date | null;
}

/**
 * Creates a recurring rule for habitual routines or repeating tasks.
 */
export async function createRecurringRule(input: CreateRecurringRuleInput) {
  const userId = await resolveUserId(input.userId);

  if (!input.title || input.title.trim() === "") {
    throw new Error("Title is required for recurring rule");
  }

  const startDate = input.startDate ? new Date(input.startDate) : new Date(0);
  const endDate = input.endDate ? new Date(input.endDate) : null;
  const frequency = input.frequency || RecurrenceFrequency.DAILY;

  let daysOfWeek = input.daysOfWeek || [];
  if (frequency === RecurrenceFrequency.WEEKDAYS && daysOfWeek.length === 0) {
    daysOfWeek = [1, 2, 3, 4, 5]; // Mon - Fri
  } else if (frequency === RecurrenceFrequency.DAILY && daysOfWeek.length === 0) {
    daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  }

  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringRule.create({
      data: {
        userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        duration: Math.max(5, input.duration || 30),
        priority: input.priority || TaskPriority.MEDIUM,
        frequency,
        daysOfWeek,
        tags: input.tags || ["routine"],
        startDate,
        endDate,
        isActive: true,
      },
    });

    await tx.actionHistory.create({
      data: {
        userId,
        actionType: "CREATE_RECURRING_RULE",
        entityType: "RECURRING_RULE",
        entityId: rule.id,
        payload: {
          title: rule.title,
          frequency: rule.frequency,
        },
      },
    });

    return rule;
  });
}

/**
 * Lists all recurring rules for a user.
 */
export async function listRecurringRules(userIdArg?: string) {
  const userId = await resolveUserId(userIdArg);
  return prisma.recurringRule.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { tasks: true },
      },
    },
  });
}

/**
 * Generates concrete task occurrences for recurring rules for a specified date or date range.
 * Mathematically prevents duplicates using composite unique constraint [recurringRuleId, recurrenceDate].
 */
export async function generateRecurringTasks(
  userIdArg?: string,
  targetDateArg?: string,
  horizonDays: number = 1
) {
  const userId = await resolveUserId(userIdArg);
  const baseDateStr = targetDateArg || new Date().toISOString().slice(0, 10);

  const activeRules = await prisma.recurringRule.findMany({
    where: {
      userId,
      isActive: true,
    },
  });

  const generatedTasks = [];

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
    const dayDate = new Date(`${baseDateStr}T00:00:00.000Z`);
    dayDate.setUTCDate(dayDate.getUTCDate() + dayOffset);
    const dateStr = dayDate.toISOString().slice(0, 10);
    const dayOfWeek = dayDate.getUTCDay(); // 0 = Sun, 1 = Mon, ...

    for (const rule of activeRules) {
      // Check date bounds
      if (rule.startDate && new Date(rule.startDate).toISOString().slice(0, 10) > dateStr) {
        continue;
      }
      if (rule.endDate && new Date(rule.endDate).toISOString().slice(0, 10) < dateStr) {
        continue;
      }

      // Check frequency / day matching
      let isMatch = false;
      if (rule.frequency === RecurrenceFrequency.DAILY) {
        isMatch = true;
      } else if (rule.frequency === RecurrenceFrequency.WEEKDAYS) {
        isMatch = dayOfWeek >= 1 && dayOfWeek <= 5;
      } else if (rule.frequency === RecurrenceFrequency.WEEKLY) {
        isMatch = rule.daysOfWeek.length > 0 ? rule.daysOfWeek.includes(dayOfWeek) : dayOfWeek === 1;
      } else if (rule.frequency === RecurrenceFrequency.CUSTOM) {
        isMatch = rule.daysOfWeek.includes(dayOfWeek);
      }

      if (!isMatch) continue;

      // Upsert to guarantee zero duplicates even under concurrent calls
      const deadline = new Date(`${dateStr}T23:59:59.999Z`);
      const task = await prisma.task.upsert({
        where: {
          recurringRuleId_recurrenceDate: {
            recurringRuleId: rule.id,
            recurrenceDate: dateStr,
          },
        },
        update: {
          // If task already exists, do not mutate if user edited it
        },
        create: {
          userId,
          title: rule.title,
          description: rule.description,
          duration: rule.duration,
          priority: rule.priority,
          deadline,
          status: TaskStatus.PENDING,
          tags: Array.from(new Set([...rule.tags, "recurring", dateStr])),
          recurringRuleId: rule.id,
          recurrenceDate: dateStr,
        },
      });

      generatedTasks.push(task);
    }
  }

  return {
    date: baseDateStr,
    generatedCount: generatedTasks.length,
    tasks: generatedTasks,
  };
}

/**
 * Toggles or deletes a recurring rule.
 */
export async function deleteRecurringRule(id: string, userIdArg?: string) {
  const userId = await resolveUserId(userIdArg);
  const existing = await prisma.recurringRule.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    throw new Error(`Recurring rule not found with id: ${id}`);
  }

  await prisma.recurringRule.delete({ where: { id } });
  return { success: true, message: `Recurring rule ${id} deleted` };
}
