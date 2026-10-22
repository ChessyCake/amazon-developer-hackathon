import { TaskPriority, TaskStatus } from "@prisma/client";
import {
  PlannerInput,
  PlannerResult,
  PlannerTask,
  PlannerEvent,
  PlannerPreferences,
} from "./types.js";
import { scheduleDay } from "./scheduler.js";
import { comparePlans, PlanComparisonResult, PlanItemLike } from "./comparator.js";

export interface EventDisruption {
  eventId: string;
  delayMinutes?: number;
  newStartTime?: Date | string;
  newEndTime?: Date | string;
  title?: string;
}

export interface TaskDisruption {
  taskId: string;
  extendedMinutes?: number;
}

export interface ReplanInput {
  date: string;
  currentPlanItems: PlanItemLike[];
  tasks: PlannerTask[];
  fixedEvents: PlannerEvent[];
  preferences: PlannerPreferences;
  disruptions?: {
    delayedEvents?: EventDisruption[];
    extendedTasks?: TaskDisruption[];
    currentTime?: Date | string;
    reason?: string;
  };
  constraints?: {
    preservedTaskIds?: string[]; // IDs or titles of tasks that must be protected
    pinnedTaskIds?: string[];    // IDs of tasks that shouldn't change time if possible
  };
}

export interface ReplanResult {
  schedule: PlannerResult;
  diff: PlanComparisonResult;
  replanReason: string;
  tradeOffs: string[];
}

/**
 * Adaptive replanning engine that calculates an updated schedule based on disruptions
 * (e.g. events running late, tasks taking longer) while respecting user preservation constraints.
 */
export function replanDay(input: ReplanInput): ReplanResult {
  const { date, preferences, disruptions, constraints } = input;
  const replanReason =
    disruptions?.reason ||
    (disruptions?.delayedEvents && disruptions.delayedEvents.length > 0
      ? `Event '${disruptions.delayedEvents[0].eventId}' delayed by ${disruptions.delayedEvents[0].delayMinutes ?? 0}m.`
      : "Adaptive schedule revision requested.");

  // 1. Adjust fixed events based on disruptions
  const adjustedEvents: PlannerEvent[] = input.fixedEvents.map((evt) => {
    const disruption = disruptions?.delayedEvents?.find(
      (d) => d.eventId === evt.id || (d.title && evt.title.toLowerCase().includes(d.title.toLowerCase()))
    );

    if (!disruption) {
      return { ...evt };
    }

    let start = new Date(evt.startTime);
    let end = new Date(evt.endTime);

    if (disruption.newStartTime) {
      start = new Date(disruption.newStartTime);
    }
    if (disruption.newEndTime) {
      end = new Date(disruption.newEndTime);
    } else if (disruption.delayMinutes) {
      // Event ran late -> extend end time or shift window
      end = new Date(end.getTime() + disruption.delayMinutes * 60000);
    }

    return {
      id: evt.id,
      title: evt.title,
      startTime: start,
      endTime: end,
      isAllDay: evt.isAllDay,
      location: evt.location,
    };
  });

  // 2. Adjust tasks and apply user preservation constraints
  const preservedSet = new Set<string>();
  if (constraints?.preservedTaskIds) {
    for (const idOrTitle of constraints.preservedTaskIds) {
      preservedSet.add(idOrTitle.toLowerCase());
    }
  }

  const adjustedTasks: PlannerTask[] = input.tasks.map((task) => {
    let priority = task.priority;
    const isPreserved =
      preservedSet.has(task.id.toLowerCase()) ||
      preservedSet.has(task.title.toLowerCase()) ||
      [...preservedSet].some((p) => task.title.toLowerCase().includes(p));

    if (isPreserved) {
      // Boost priority to ensure this task is allocated first
      priority = TaskPriority.URGENT;
    }

    // Check task extensions
    let duration = task.duration;
    const taskDisruption = disruptions?.extendedTasks?.find(
      (t) => t.taskId === task.id
    );
    if (taskDisruption?.extendedMinutes) {
      duration += taskDisruption.extendedMinutes;
    }

    return {
      ...task,
      priority,
      duration,
    };
  });

  // 3. Invoke deterministic scheduling engine
  const plannerInput: PlannerInput = {
    date,
    tasks: adjustedTasks,
    fixedEvents: adjustedEvents,
    preferences,
  };

  const scheduleResult = scheduleDay(plannerInput);

  // 4. Generate structured diff against previous approved plan
  const diff = comparePlans(input.currentPlanItems, scheduleResult.scheduledItems);

  // 5. Generate human-readable trade-off explanations
  const tradeOffs = [...diff.tradeOffs];

  if (constraints?.preservedTaskIds && constraints.preservedTaskIds.length > 0) {
    for (const preservedName of constraints.preservedTaskIds) {
      const isScheduled = scheduleResult.scheduledItems.some((item) =>
        item.title.toLowerCase().includes(preservedName.toLowerCase())
      );
      if (isScheduled) {
        tradeOffs.unshift(
          `Preserved '${preservedName}' in schedule as requested by user.`
        );
      }
    }
  }

  if (scheduleResult.unscheduledTasks.length > 0) {
    for (const unscheduled of scheduleResult.unscheduledTasks) {
      tradeOffs.push(
        `Trade-off: Could not schedule '${unscheduled.title}' (${unscheduled.duration}m): ${unscheduled.reason}`
      );
    }
  }

  return {
    schedule: scheduleResult,
    diff,
    replanReason,
    tradeOffs,
  };
}
