import { ScheduledPlanItem } from "./types.js";

export interface PlanItemDiff {
  title: string;
  itemType: string;
  taskId?: string | null;
  calendarEventId?: string | null;
  oldStartTime?: string;
  oldEndTime?: string;
  newStartTime?: string;
  newEndTime?: string;
  oldDurationMinutes?: number;
  newDurationMinutes?: number;
  shiftMinutes?: number;
  reason?: string;
}

export interface PlanComparisonResult {
  added: PlanItemDiff[];
  removed: PlanItemDiff[];
  moved: PlanItemDiff[];
  unchanged: PlanItemDiff[];
  summary: {
    totalAdded: number;
    totalRemoved: number;
    totalMoved: number;
    totalUnchanged: number;
    netScheduledMinutesDelta: number;
  };
  tradeOffs: string[];
}

export interface PlanItemLike {
  title: string;
  itemType: string;
  startTime: Date | string;
  endTime: Date | string;
  durationMinutes?: number;
  taskId?: string | null;
  calendarEventId?: string | null;
}

/**
 * Compares two schedules (e.g. current active plan vs candidate replan)
 * and produces a detailed, structured diff and trade-off explanations.
 */
export function comparePlans(
  baseItems: PlanItemLike[],
  targetItems: PlanItemLike[]
): PlanComparisonResult {
  const added: PlanItemDiff[] = [];
  const removed: PlanItemDiff[] = [];
  const moved: PlanItemDiff[] = [];
  const unchanged: PlanItemDiff[] = [];
  const tradeOffs: string[] = [];

  // Match key: taskId or calendarEventId or fallback to title
  function getKey(item: PlanItemLike): string {
    if (item.taskId) return `task:${item.taskId}`;
    if (item.calendarEventId) return `event:${item.calendarEventId}`;
    return `title:${item.title.trim().toLowerCase()}`;
  }

  const baseMap = new Map<string, PlanItemLike>();
  for (const item of baseItems) {
    baseMap.set(getKey(item), item);
  }

  const targetMap = new Map<string, PlanItemLike>();
  for (const item of targetItems) {
    targetMap.set(getKey(item), item);
  }

  // Check target items against base items
  for (const [key, targetItem] of targetMap.entries()) {
    const baseItem = baseMap.get(key);

    const targetStart = new Date(targetItem.startTime);
    const targetEnd = new Date(targetItem.endTime);
    const targetDuration =
      targetItem.durationMinutes ??
      Math.round((targetEnd.getTime() - targetStart.getTime()) / 60000);

    if (!baseItem) {
      // Newly added item
      added.push({
        title: targetItem.title,
        itemType: targetItem.itemType,
        taskId: targetItem.taskId,
        calendarEventId: targetItem.calendarEventId,
        newStartTime: targetStart.toISOString(),
        newEndTime: targetEnd.toISOString(),
        newDurationMinutes: targetDuration,
        reason: "Newly scheduled in revised plan",
      });
      tradeOffs.push(`Added '${targetItem.title}' (${targetDuration}m) to schedule.`);
    } else {
      const baseStart = new Date(baseItem.startTime);
      const baseEnd = new Date(baseItem.endTime);
      const baseDuration =
        baseItem.durationMinutes ??
        Math.round((baseEnd.getTime() - baseStart.getTime()) / 60000);

      const shiftMinutes = Math.round(
        (targetStart.getTime() - baseStart.getTime()) / 60000
      );
      const durationChange = targetDuration - baseDuration;

      if (shiftMinutes === 0 && durationChange === 0) {
        unchanged.push({
          title: targetItem.title,
          itemType: targetItem.itemType,
          taskId: targetItem.taskId,
          calendarEventId: targetItem.calendarEventId,
          oldStartTime: baseStart.toISOString(),
          oldEndTime: baseEnd.toISOString(),
          newStartTime: targetStart.toISOString(),
          newEndTime: targetEnd.toISOString(),
          oldDurationMinutes: baseDuration,
          newDurationMinutes: targetDuration,
          shiftMinutes: 0,
        });
      } else {
        const moveDetails = [];
        if (shiftMinutes !== 0) {
          moveDetails.push(
            shiftMinutes > 0
              ? `delayed by ${shiftMinutes}m`
              : `advanced by ${Math.abs(shiftMinutes)}m`
          );
        }
        if (durationChange !== 0) {
          moveDetails.push(
            durationChange > 0
              ? `extended by ${durationChange}m`
              : `shortened by ${Math.abs(durationChange)}m`
          );
        }

        const reason = moveDetails.join(", ");
        moved.push({
          title: targetItem.title,
          itemType: targetItem.itemType,
          taskId: targetItem.taskId,
          calendarEventId: targetItem.calendarEventId,
          oldStartTime: baseStart.toISOString(),
          oldEndTime: baseEnd.toISOString(),
          newStartTime: targetStart.toISOString(),
          newEndTime: targetEnd.toISOString(),
          oldDurationMinutes: baseDuration,
          newDurationMinutes: targetDuration,
          shiftMinutes,
          reason,
        });

        tradeOffs.push(
          `Moved '${targetItem.title}': shifted ${shiftMinutes > 0 ? `+${shiftMinutes}m later` : `${shiftMinutes}m earlier`} (${baseStart.toISOString().slice(11, 16)} -> ${targetStart.toISOString().slice(11, 16)}).`
        );
      }
    }
  }

  // Check for removed items
  for (const [key, baseItem] of baseMap.entries()) {
    if (!targetMap.has(key)) {
      const baseStart = new Date(baseItem.startTime);
      const baseEnd = new Date(baseItem.endTime);
      const baseDuration =
        baseItem.durationMinutes ??
        Math.round((baseEnd.getTime() - baseStart.getTime()) / 60000);

      removed.push({
        title: baseItem.title,
        itemType: baseItem.itemType,
        taskId: baseItem.taskId,
        calendarEventId: baseItem.calendarEventId,
        oldStartTime: baseStart.toISOString(),
        oldEndTime: baseEnd.toISOString(),
        oldDurationMinutes: baseDuration,
        reason: "Dropped or deferred to multi-day backlog due to schedule constraints",
      });
      tradeOffs.push(
        `Removed '${baseItem.title}' (${baseDuration}m) from daily schedule.`
      );
    }
  }

  const baseMinutes = baseItems.reduce((acc, i) => {
    const s = new Date(i.startTime).getTime();
    const e = new Date(i.endTime).getTime();
    return acc + Math.round((e - s) / 60000);
  }, 0);

  const targetMinutes = targetItems.reduce((acc, i) => {
    const s = new Date(i.startTime).getTime();
    const e = new Date(i.endTime).getTime();
    return acc + Math.round((e - s) / 60000);
  }, 0);

  return {
    added,
    removed,
    moved,
    unchanged,
    summary: {
      totalAdded: added.length,
      totalRemoved: removed.length,
      totalMoved: moved.length,
      totalUnchanged: unchanged.length,
      netScheduledMinutesDelta: targetMinutes - baseMinutes,
    },
    tradeOffs,
  };
}
