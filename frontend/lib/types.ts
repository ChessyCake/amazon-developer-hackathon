export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type PlanStatus = "DRAFT" | "PROPOSED" | "ACTIVE" | "COMPLETED" | "SUPERSEDED" | "REJECTED" | "ARCHIVED";
export type PlanItemType = "TASK" | "EVENT" | "BREAK" | "BUFFER";

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  duration: number;
  priority: TaskPriority;
  deadline: string | null;
  status: TaskStatus;
  tags: string[];
  dependencies: string[];
  allowSplitting: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location: string | null;
}

export interface UserPreference {
  id: string;
  userId: string;
  focusMinutes: number;
  breakMinutes: number;
  workStartTime: string;
  workEndTime: string;
  bufferMinutes: number;
  timezone?: string;
}

export interface PlanItem {
  id: string;
  planId: string;
  itemType: PlanItemType;
  title: string;
  startTime: string;
  endTime: string;
  order: number;
  isCompleted: boolean;
  isPinned: boolean;
  part: number | null;
  totalParts: number | null;
  taskId: string | null;
  calendarEventId: string | null;
}

export interface Plan {
  id: string;
  userId: string;
  date: string;
  status: PlanStatus;
  version: number;
  parentPlanId: string | null;
  replanReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: PlanItem[];
}

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

export interface PreviewReplanResult {
  proposedPlanId: string;
  proposedVersion: number;
  basePlanId: string | null;
  baseVersion: number | null;
  diff: PlanComparisonResult;
  tradeOffs: string[];
  unscheduledTasks: Array<{ taskId: string; title: string; duration: number; reason: string }>;
  replanReason: string;
  isFeasible: boolean;
  isWhatIf: boolean;
}

export interface DayContext {
  date: string;
  timezone: string;
  fixedEvents: CalendarEvent[];
  pendingTasks: Task[];
  preferences: {
    focusMinutes: number;
    breakMinutes: number;
    workStartTime: string;
    workEndTime: string;
    bufferMinutes: number;
  };
}

export interface ActionHistory {
  id: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  payload: any;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: Array<{ name: string; arguments: any }>;
  toolResults?: any[];
  timestamp: string;
  proposal?: PreviewReplanResult;
}
