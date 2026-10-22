import {
  PlannerInput,
  ScheduledPlanItem,
  TimeSlot,
  PlanValidationResult,
  PlannerTask,
} from "./types.js";

/**
 * Independent validation pass for a generated plan.
 * Validates absence of overlaps, adherence to working window, time conservation,
 * dependency constraints, and deadline compliance.
 */
export function validatePlan(
  input: PlannerInput,
  scheduledItems: ScheduledPlanItem[],
  freeSlotsRemaining: TimeSlot[],
  workWindow: { start: Date; end: Date; totalMinutes: number }
): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Sort scheduled items chronologically
  const sorted = [...scheduledItems].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  // 2. Overlap detection
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];

    if (cur.endTime.getTime() > next.startTime.getTime()) {
      errors.push(
        `Overlap detected between '${cur.title}' (${cur.startTime.toISOString()} - ${cur.endTime.toISOString()}) and '${next.title}' (${next.startTime.toISOString()} - ${next.endTime.toISOString()}).`
      );
    }
  }

  // 3. Time bounds & Working Hours check
  for (const item of sorted) {
    if (item.startTime.getTime() < workWindow.start.getTime()) {
      // Calendar events might start before work hours, but tasks/breaks shouldn't
      if (item.itemType !== "EVENT") {
        errors.push(
          `Item '${item.title}' starts at ${item.startTime.toISOString()}, which is before work hours start (${workWindow.start.toISOString()}).`
        );
      } else {
        warnings.push(
          `Event '${item.title}' starts before regular working hours.`
        );
      }
    }
    if (item.endTime.getTime() > workWindow.end.getTime()) {
      if (item.itemType !== "EVENT") {
        errors.push(
          `Item '${item.title}' ends at ${item.endTime.toISOString()}, which is after work hours end (${workWindow.end.toISOString()}).`
        );
      } else {
        warnings.push(
          `Event '${item.title}' extends past regular working hours.`
        );
      }
    }
  }

  // 4. Conservation of Time within work window
  // Sum of items completely inside window + free slots must equal workWindow.totalMinutes
  let accountedMinutes = 0;
  for (const item of sorted) {
    const clampedStart = Math.max(item.startTime.getTime(), workWindow.start.getTime());
    const clampedEnd = Math.min(item.endTime.getTime(), workWindow.end.getTime());
    if (clampedEnd > clampedStart) {
      accountedMinutes += Math.round((clampedEnd - clampedStart) / 60000);
    }
  }
  for (const slot of freeSlotsRemaining) {
    accountedMinutes += slot.durationMinutes;
  }

  const discrepancy = Math.abs(accountedMinutes - workWindow.totalMinutes);
  if (discrepancy > 2) { // 2 minute tolerance for rounding
    errors.push(
      `Conservation of time failed: accounted minutes (${accountedMinutes}) does not match work window total (${workWindow.totalMinutes}). Discrepancy of ${discrepancy}m.`
    );
  }

  // 5. Dependency check
  const taskCompletionTimes = new Map<string, number>();
  for (const item of sorted) {
    if (item.taskId) {
      const prev = taskCompletionTimes.get(item.taskId) ?? 0;
      taskCompletionTimes.set(item.taskId, Math.max(prev, item.endTime.getTime()));
    }
  }

  const taskMap = new Map<string, PlannerTask>();
  for (const t of input.tasks) {
    taskMap.set(t.id, t);
  }

  for (const item of sorted) {
    if (!item.taskId) continue;
    const task = taskMap.get(item.taskId);
    if (!task || !task.dependencies || task.dependencies.length === 0) continue;

    for (const depId of task.dependencies) {
      const depCompletion = taskCompletionTimes.get(depId);
      if (depCompletion === undefined) {
        // Dependency wasn't scheduled today; check if already completed
        const depTask = taskMap.get(depId);
        if (depTask && depTask.status !== "COMPLETED") {
          errors.push(
            `Task '${task.title}' depends on unscheduled/incomplete task '${depTask.title}' (ID: ${depId}).`
          );
        }
      } else if (depCompletion > item.startTime.getTime()) {
        errors.push(
          `Dependency violation: Task '${task.title}' starts at ${item.startTime.toISOString()} before prerequisite task ${depId} completes at ${new Date(depCompletion).toISOString()}.`
        );
      }
    }
  }

  // 6. Deadline check
  for (const item of sorted) {
    if (!item.taskId) continue;
    const task = taskMap.get(item.taskId);
    if (task?.deadline) {
      const deadlineDate = new Date(task.deadline);
      if (item.endTime.getTime() > deadlineDate.getTime()) {
        errors.push(
          `Deadline missed: Task '${task.title}' finishes at ${item.endTime.toISOString()} after deadline ${deadlineDate.toISOString()}.`
        );
      }
    }
  }

  // 7. Task duration conservation (especially for split tasks)
  const taskScheduledDurations = new Map<string, number>();
  for (const item of sorted) {
    if (item.taskId && item.itemType === "TASK") {
      const current = taskScheduledDurations.get(item.taskId) ?? 0;
      taskScheduledDurations.set(item.taskId, current + item.durationMinutes);
    }
  }

  for (const [taskId, scheduledDuration] of taskScheduledDurations.entries()) {
    const task = taskMap.get(taskId);
    if (task && scheduledDuration !== task.duration) {
      errors.push(
        `Task duration mismatch for '${task.title}': scheduled duration ${scheduledDuration}m does not match requested ${task.duration}m.`
      );
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
