import { TaskPriority, TaskStatus, PlanItemType } from "@prisma/client";
import {
  PlannerInput,
  PlannerResult,
  PlannerTask,
  ScheduledPlanItem,
  UnscheduledTaskReport,
  TimeSlot,
  PlanMetrics,
} from "./types.js";
import {
  getWorkWindow,
  mergeBusyIntervals,
  calculateFreeSlots,
} from "./intervals.js";
import { validatePlan } from "./validator.js";

const PRIORITY_SCORES: Record<TaskPriority, number> = {
  [TaskPriority.URGENT]: 400,
  [TaskPriority.HIGH]: 300,
  [TaskPriority.MEDIUM]: 200,
  [TaskPriority.LOW]: 100,
};

/**
 * Topologically sorts and ranks tasks deterministically based on:
 * 1. Dependencies (prerequisites appear before dependents)
 * 2. Priority score (URGENT > HIGH > MEDIUM > LOW)
 * 3. Deadline urgency (closer deadlines first)
 * 4. Deterministic tie-breaker (ID)
 */
export function rankTasks(tasks: PlannerTask[], referenceDate: Date): {
  ranked: PlannerTask[];
  dependencyErrors: Map<string, string>;
} {
  const dependencyErrors = new Map<string, string>();
  const taskMap = new Map<string, PlannerTask>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  // Only consider pending or in-progress tasks
  const eligible = tasks.filter(
    (t) => t.status === TaskStatus.PENDING || t.status === TaskStatus.IN_PROGRESS
  );

  for (const t of eligible) {
    taskMap.set(t.id, t);
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
  }

  // Build dependency graph
  for (const t of eligible) {
    if (t.dependencies && t.dependencies.length > 0) {
      for (const depId of t.dependencies) {
        // If dependency is already completed in general tasks list, ignore
        const depTask = tasks.find((item) => item.id === depId);
        if (depTask?.status === TaskStatus.COMPLETED) {
          continue; // Satisfied
        }

        if (!taskMap.has(depId)) {
          dependencyErrors.set(
            t.id,
            `Prerequisite task '${depId}' not found or not in active tasks.`
          );
          continue;
        }

        // depId -> t.id (depId must finish before t.id)
        adj.get(depId)!.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      }
    }
  }

  // Priority queue calculation
  function calculateScore(t: PlannerTask): number {
    let score = PRIORITY_SCORES[t.priority] || 200;

    if (t.deadline) {
      const deadlineMs = new Date(t.deadline).getTime();
      const diffHours = (deadlineMs - referenceDate.getTime()) / (1000 * 60 * 60);

      if (diffHours < 0) {
        score += 2000; // Past due or due today
      } else if (diffHours <= 12) {
        score += 1000;
      } else if (diffHours <= 24) {
        score += 500;
      } else if (diffHours <= 48) {
        score += 250;
      }
    }

    return score;
  }

  // Kahn's algorithm with priority ordering
  const ready: PlannerTask[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0 && !dependencyErrors.has(id)) {
      ready.push(taskMap.get(id)!);
    }
  }

  const ranked: PlannerTask[] = [];
  while (ready.length > 0) {
    // Sort ready tasks by score desc, then deadline asc, then ID asc
    ready.sort((a, b) => {
      const scoreDiff = calculateScore(b) - calculateScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;

      return a.id.localeCompare(b.id);
    });

    const next = ready.shift()!;
    ranked.push(next);

    const neighbors = adj.get(next.id) || [];
    for (const neighborId of neighbors) {
      const currentDeg = inDegree.get(neighborId)! - 1;
      inDegree.set(neighborId, currentDeg);
      if (currentDeg === 0 && !dependencyErrors.has(neighborId)) {
        ready.push(taskMap.get(neighborId)!);
      }
    }
  }

  // Detect circular dependencies
  for (const t of eligible) {
    if (!ranked.includes(t) && !dependencyErrors.has(t.id)) {
      dependencyErrors.set(
        t.id,
        `Circular dependency cycle detected involving task '${t.title}'.`
      );
    }
  }

  return { ranked, dependencyErrors };
}

/**
 * Main deterministic scheduling engine for LifeOS Stage 2.
 */
export function scheduleDay(input: PlannerInput): PlannerResult {
  const { date, preferences } = input;
  const explanations: string[] = [];
  const scheduledItems: ScheduledPlanItem[] = [];
  const unscheduledTasks: UnscheduledTaskReport[] = [];

  // 1. Calculate working hours window in user timezone
  const workWindow = getWorkWindow(date, preferences);
  explanations.push(
    `Working window for ${date} set to ${preferences.workStartTime} - ${preferences.workEndTime} (${workWindow.totalMinutes}m in ${preferences.timezone}).`
  );

  // 2. Fixed calendar events
  // First, convert fixed events to scheduled plan items
  let itemOrder = 1;
  const activeEvents = input.fixedEvents.map((evt) => {
    return {
      id: evt.id,
      title: evt.title,
      startTime: new Date(evt.startTime),
      endTime: new Date(evt.endTime),
      isAllDay: evt.isAllDay,
      location: evt.location,
    };
  });

  // Sort events chronologically
  activeEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (const evt of activeEvents) {
    const durationMins = Math.round((evt.endTime.getTime() - evt.startTime.getTime()) / 60000);
    scheduledItems.push({
      order: itemOrder++,
      itemType: PlanItemType.EVENT,
      title: evt.title,
      startTime: evt.startTime,
      endTime: evt.endTime,
      durationMinutes: durationMins,
      calendarEventId: evt.id,
      explanation: `Fixed calendar event: ${evt.title} (${durationMins}m).`,
    });
  }

  // 3. Compute busy intervals and free slots
  const busyIntervals = mergeBusyIntervals(
    input.fixedEvents,
    workWindow.start,
    workWindow.end,
    preferences.bufferMinutes
  );

  let currentFreeSlots = calculateFreeSlots(
    workWindow.start,
    workWindow.end,
    busyIntervals
  );

  // 4. Rank tasks deterministically
  const { ranked, dependencyErrors } = rankTasks(input.tasks, workWindow.start);

  // Report pre-failed dependency tasks
  for (const [taskId, errorMsg] of dependencyErrors.entries()) {
    const task = input.tasks.find((t) => t.id === taskId);
    if (task) {
      unscheduledTasks.push({
        taskId: task.id,
        title: task.title,
        duration: task.duration,
        priority: task.priority,
        reason: errorMsg,
      });
      explanations.push(`Cannot schedule '${task.title}': ${errorMsg}`);
    }
  }

  // 5. Greedy slot allocation with Focus Sessions & Break logic
  const focusMinutes = preferences.focusMinutes;
  const breakMinutes = preferences.breakMinutes;
  const taskCompletionMap = new Map<string, Date>();

  for (const task of ranked) {
    // Check if task deadline is already in the past or impossible
    if (task.deadline) {
      const d = new Date(task.deadline);
      if (d.getTime() <= workWindow.start.getTime()) {
        unscheduledTasks.push({
          taskId: task.id,
          title: task.title,
          duration: task.duration,
          priority: task.priority,
          reason: `Deadline (${d.toISOString()}) passed before start of work window.`,
        });
        explanations.push(`Deadline for '${task.title}' expired before work started.`);
        continue;
      }
    }

    // Check if dependencies were completed earlier in the schedule
    let earliestAllowedStartTime = workWindow.start.getTime();
    if (task.dependencies && task.dependencies.length > 0) {
      for (const depId of task.dependencies) {
        const completion = taskCompletionMap.get(depId);
        if (completion) {
          earliestAllowedStartTime = Math.max(earliestAllowedStartTime, completion.getTime());
        }
      }
    }

    let remainingDuration = task.duration;
    const scheduledParts: Array<{ start: Date; end: Date; duration: number }> = [];

    // Helper to find a free slot accommodating duration after earliestAllowedStartTime
    let scheduledSuccessfully = false;

    if (!task.allowSplitting) {
      // Must fit in a single continuous block
      for (let i = 0; i < currentFreeSlots.length; i++) {
        const slot = currentFreeSlots[i];
        const effectiveSlotStart = Math.max(slot.start.getTime(), earliestAllowedStartTime);
        const availableMinutes = Math.round((slot.end.getTime() - effectiveSlotStart) / 60000);

        if (availableMinutes >= task.duration) {
          const taskStart = new Date(effectiveSlotStart);
          const taskEnd = new Date(effectiveSlotStart + task.duration * 60000);

          // Check deadline compliance
          if (task.deadline && taskEnd.getTime() > new Date(task.deadline).getTime()) {
            continue; // Doesn't finish before deadline in this slot, try next
          }

          // Schedule task
          scheduledParts.push({
            start: taskStart,
            end: taskEnd,
            duration: task.duration,
          });

          taskCompletionMap.set(task.id, taskEnd);
          scheduledSuccessfully = true;

          // Re-slice the slot
          const newSlots: TimeSlot[] = [];
          if (taskStart.getTime() > slot.start.getTime()) {
            newSlots.push({
              start: slot.start,
              end: taskStart,
              durationMinutes: Math.round((taskStart.getTime() - slot.start.getTime()) / 60000),
            });
          }

          // Insert optional break if requested & fits
          let postTaskEnd = taskEnd;
          if (task.duration >= focusMinutes && breakMinutes > 0) {
            const breakEndMs = Math.min(slot.end.getTime(), taskEnd.getTime() + breakMinutes * 60000);
            if (breakEndMs > taskEnd.getTime()) {
              const actualBreakDuration = Math.round((breakEndMs - taskEnd.getTime()) / 60000);
              scheduledItems.push({
                order: itemOrder++,
                itemType: PlanItemType.BREAK,
                title: `Break after ${task.title}`,
                startTime: taskEnd,
                endTime: new Date(breakEndMs),
                durationMinutes: actualBreakDuration,
                explanation: `Configured ${actualBreakDuration}m break after focus session.`,
              });
              postTaskEnd = new Date(breakEndMs);
            }
          }

          if (slot.end.getTime() > postTaskEnd.getTime()) {
            newSlots.push({
              start: postTaskEnd,
              end: slot.end,
              durationMinutes: Math.round((slot.end.getTime() - postTaskEnd.getTime()) / 60000),
            });
          }

          currentFreeSlots.splice(i, 1, ...newSlots);
          break;
        }
      }

      if (!scheduledSuccessfully) {
        const largestSlot = currentFreeSlots.reduce(
          (max, s) => Math.max(max, s.durationMinutes),
          0
        );
        unscheduledTasks.push({
          taskId: task.id,
          title: task.title,
          duration: task.duration,
          priority: task.priority,
          reason: `Requires ${task.duration}m continuous time, but largest available slot is ${largestSlot}m (splitting not permitted).`,
        });
        explanations.push(
          `Could not fit '${task.title}' (${task.duration}m continuous required; largest free slot: ${largestSlot}m).`
        );
      }
    } else {
      // Task splitting is permitted
      let slotIdx = 0;
      while (remainingDuration > 0 && slotIdx < currentFreeSlots.length) {
        const slot = currentFreeSlots[slotIdx];
        const effectiveSlotStart = Math.max(slot.start.getTime(), earliestAllowedStartTime);
        const availableInSlot = Math.round((slot.end.getTime() - effectiveSlotStart) / 60000);

        if (availableInSlot <= 5) {
          slotIdx++;
          continue;
        }

        // Allocate up to min(remainingDuration, availableInSlot, focusMinutes)
        const chunkDuration = Math.min(remainingDuration, availableInSlot, focusMinutes);
        const chunkStart = new Date(effectiveSlotStart);
        const chunkEnd = new Date(effectiveSlotStart + chunkDuration * 60000);

        // Verify deadline for this chunk
        if (task.deadline && chunkEnd.getTime() > new Date(task.deadline).getTime()) {
          slotIdx++;
          continue;
        }

        scheduledParts.push({
          start: chunkStart,
          end: chunkEnd,
          duration: chunkDuration,
        });

        remainingDuration -= chunkDuration;
        earliestAllowedStartTime = chunkEnd.getTime();
        taskCompletionMap.set(task.id, chunkEnd);

        // Update slot
        const newSlots: TimeSlot[] = [];
        if (chunkStart.getTime() > slot.start.getTime()) {
          newSlots.push({
            start: slot.start,
            end: chunkStart,
            durationMinutes: Math.round((chunkStart.getTime() - slot.start.getTime()) / 60000),
          });
        }

        let postChunkEnd = chunkEnd;
        // If more work remains on this task, insert configured break
        if (remainingDuration > 0 && breakMinutes > 0) {
          const breakEndMs = Math.min(slot.end.getTime(), chunkEnd.getTime() + breakMinutes * 60000);
          if (breakEndMs > chunkEnd.getTime()) {
            const actualBreak = Math.round((breakEndMs - chunkEnd.getTime()) / 60000);
            scheduledItems.push({
              order: itemOrder++,
              itemType: PlanItemType.BREAK,
              title: `Break after ${task.title} (Part ${scheduledParts.length})`,
              startTime: chunkEnd,
              endTime: new Date(breakEndMs),
              durationMinutes: actualBreak,
              explanation: `Configured ${actualBreak}m break between focus sessions.`,
            });
            postChunkEnd = new Date(breakEndMs);
          }
        }

        if (slot.end.getTime() > postChunkEnd.getTime()) {
          newSlots.push({
            start: postChunkEnd,
            end: slot.end,
            durationMinutes: Math.round((slot.end.getTime() - postChunkEnd.getTime()) / 60000),
          });
        }

        currentFreeSlots.splice(slotIdx, 1, ...newSlots);
        if (newSlots.length === 0) {
          // Slot was completely consumed
        }
      }

      if (remainingDuration === 0) {
        scheduledSuccessfully = true;
      } else {
        // Rollback scheduled parts if task could not be completely scheduled
        unscheduledTasks.push({
          taskId: task.id,
          title: task.title,
          duration: task.duration,
          priority: task.priority,
          reason: `Insufficient remaining working hours to complete ${remainingDuration}m of total ${task.duration}m.`,
        });
        explanations.push(
          `Only ${task.duration - remainingDuration}m of ${task.duration}m could fit for '${task.title}'. Unscheduled due to insufficient time.`
        );
        // Note: We do not keep partial orphaned tasks in the committed plan unless multi-day rolls over
      }
    }

    if (scheduledSuccessfully && scheduledParts.length > 0) {
      const isSplit = scheduledParts.length > 1;
      for (let p = 0; p < scheduledParts.length; p++) {
        const part = scheduledParts[p];
        const partLabel = isSplit ? ` (Part ${p + 1}/${scheduledParts.length})` : "";
        scheduledItems.push({
          order: itemOrder++,
          itemType: PlanItemType.TASK,
          title: `${task.title}${partLabel}`,
          startTime: part.start,
          endTime: part.end,
          durationMinutes: part.duration,
          taskId: task.id,
          part: isSplit ? p + 1 : undefined,
          totalParts: isSplit ? scheduledParts.length : undefined,
          explanation: `Scheduled ${task.title}${partLabel} (${part.duration}m) based on ${task.priority} priority.${
            task.deadline ? ` Deadline: ${new Date(task.deadline).toISOString()}` : ""
          }`,
        });
      }
      explanations.push(
        `Scheduled '${task.title}' (${task.duration}m total${
          isSplit ? ` split into ${scheduledParts.length} parts` : ""
        }).`
      );
    }
  }

  // 6. Sort scheduled items chronologically and assign clean sequential orders
  scheduledItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  scheduledItems.forEach((item, idx) => {
    item.order = idx + 1;
  });

  // Re-calculate remaining free slots exactly
  const allBusyWindows = scheduledItems.map((item) => ({
    start: item.startTime,
    end: item.endTime,
  }));
  const finalMergedBusy = mergeBusyIntervals(
    allBusyWindows.map((b, i) => ({
      id: `busy-${i}`,
      title: "Busy",
      startTime: b.start,
      endTime: b.end,
    })),
    workWindow.start,
    workWindow.end,
    0
  );
  const finalFreeSlots = calculateFreeSlots(workWindow.start, workWindow.end, finalMergedBusy);

  // 7. Calculate Plan Metrics
  let scheduledTaskMinutes = 0;
  let fixedEventMinutes = 0;
  let breakMinutesTotal = 0;

  for (const item of scheduledItems) {
    if (item.itemType === PlanItemType.TASK) {
      scheduledTaskMinutes += item.durationMinutes;
    } else if (item.itemType === PlanItemType.EVENT) {
      fixedEventMinutes += item.durationMinutes;
    } else if (item.itemType === PlanItemType.BREAK) {
      breakMinutesTotal += item.durationMinutes;
    }
  }

  const freeMinutesRemaining = finalFreeSlots.reduce(
    (sum, slot) => sum + slot.durationMinutes,
    0
  );

  const metrics: PlanMetrics = {
    totalWorkWindowMinutes: workWindow.totalMinutes,
    fixedEventMinutes,
    scheduledTaskMinutes,
    breakMinutes: breakMinutesTotal,
    bufferMinutes: preferences.bufferMinutes,
    freeMinutesRemaining,
    utilizationRate:
      workWindow.totalMinutes > 0
        ? Math.min(1.0, (scheduledTaskMinutes + fixedEventMinutes + breakMinutesTotal) / workWindow.totalMinutes)
        : 0,
  };

  // 8. Independent Validation Pass
  const validation = validatePlan(
    input,
    scheduledItems,
    finalFreeSlots,
    workWindow
  );

  const isFeasible = validation.passed && unscheduledTasks.length === 0;

  return {
    date,
    timezone: preferences.timezone,
    workWindow: {
      start: workWindow.start,
      end: workWindow.end,
    },
    scheduledItems,
    unscheduledTasks,
    freeSlotsRemaining: finalFreeSlots,
    metrics,
    explanations,
    isFeasible,
    validation,
  };
}
