import { TaskPriority, TaskStatus, PlanStatus, PlanItemType } from "@prisma/client";

export interface PlannerTask {
  id: string;
  title: string;
  description?: string | null;
  duration: number; // in minutes
  priority: TaskPriority;
  deadline?: Date | string | null;
  status: TaskStatus;
  tags?: string[];
  dependencies?: string[]; // IDs of tasks that must finish before this task starts
  allowSplitting?: boolean; // If true, can be split across non-contiguous slots
}

export interface PlannerEvent {
  id: string;
  title: string;
  startTime: Date | string;
  endTime: Date | string;
  isAllDay?: boolean;
  location?: string | null;
}

export interface PlannerPreferences {
  focusMinutes: number;
  breakMinutes: number;
  workStartTime: string; // "HH:MM"
  workEndTime: string;   // "HH:MM"
  bufferMinutes: number;
  timezone: string;
}

export interface PlannerInput {
  date: string; // YYYY-MM-DD
  userId?: string;
  tasks: PlannerTask[];
  fixedEvents: PlannerEvent[];
  preferences: PlannerPreferences;
  existingApprovedPlan?: {
    id: string;
    status: PlanStatus;
    items: Array<{
      id: string;
      title: string;
      startTime: Date | string;
      endTime: Date | string;
      itemType: PlanItemType;
    }>;
  } | null;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface ScheduledPlanItem {
  id?: string;
  order: number;
  itemType: PlanItemType; // "TASK" | "EVENT" | "BREAK" | "BUFFER"
  title: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  taskId?: string | null;
  calendarEventId?: string | null;
  part?: number;
  totalParts?: number;
  explanation: string;
}

export interface UnscheduledTaskReport {
  taskId: string;
  title: string;
  duration: number;
  priority: TaskPriority;
  reason: string;
}

export interface PlanMetrics {
  totalWorkWindowMinutes: number;
  fixedEventMinutes: number;
  scheduledTaskMinutes: number;
  breakMinutes: number;
  bufferMinutes: number;
  freeMinutesRemaining: number;
  utilizationRate: number; // fraction 0.0 - 1.0
}

export interface PlanValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface PlannerResult {
  date: string;
  timezone: string;
  workWindow: {
    start: Date;
    end: Date;
  };
  scheduledItems: ScheduledPlanItem[];
  unscheduledTasks: UnscheduledTaskReport[];
  freeSlotsRemaining: TimeSlot[];
  metrics: PlanMetrics;
  explanations: string[];
  isFeasible: boolean;
  validation: PlanValidationResult;
}
