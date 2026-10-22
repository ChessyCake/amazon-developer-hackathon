import {
  DayContext,
  Task,
  UserPreference,
  Plan,
  PreviewReplanResult,
  PlanComparisonResult,
  ActionHistory,
  TaskPriority,
  TaskStatus,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  // Day Context
  async getContext(date: string, userId?: string): Promise<{ context: DayContext }> {
    const q = new URLSearchParams({ date });
    if (userId) q.set("userId", userId);
    return request(`/api/context?${q.toString()}`);
  },

  // Tasks
  async getTasks(params: {
    status?: TaskStatus;
    priority?: TaskPriority;
    tag?: string;
    search?: string;
    userId?: string;
  } = {}): Promise<{ tasks: Task[] }> {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.priority) q.set("priority", params.priority);
    if (params.tag) q.set("tag", params.tag);
    if (params.search) q.set("search", params.search);
    if (params.userId) q.set("userId", params.userId);
    return request(`/api/tasks?${q.toString()}`);
  },

  async createTask(data: {
    title: string;
    description?: string;
    duration: number;
    priority?: TaskPriority;
    deadline?: string;
    tags?: string[];
    dependencies?: string[];
    allowSplitting?: boolean;
    userId?: string;
  }): Promise<{ task: Task }> {
    return request("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateTask(id: string, data: Partial<Task>): Promise<{ task: Task }> {
    return request(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async completeTask(id: string, userId?: string): Promise<{ task: Task }> {
    return request(`/api/tasks/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },

  async deleteTask(id: string, userId?: string): Promise<{ success: boolean }> {
    const q = userId ? `?userId=${userId}` : "";
    return request(`/api/tasks/${id}${q}`, {
      method: "DELETE",
    });
  },

  // Preferences
  async getPreferences(userId?: string): Promise<{ preferences: UserPreference }> {
    const q = userId ? `?userId=${userId}` : "";
    return request(`/api/preferences${q}`);
  },

  async updatePreferences(
    userId: string | undefined,
    data: Partial<UserPreference>
  ): Promise<{ preferences: UserPreference }> {
    return request("/api/preferences", {
      method: "PUT",
      body: JSON.stringify({ userId, ...data }),
    });
  },

  // Plans
  async getPlan(date: string, userId?: string): Promise<{ plan: Plan | null }> {
    const q = new URLSearchParams({ date });
    if (userId) q.set("userId", userId);
    return request(`/api/plans?${q.toString()}`);
  },

  async generatePlan(
    date: string,
    overwriteApproved: boolean = false,
    userId?: string
  ): Promise<{ planId: string; status: string; schedule: any }> {
    return request("/api/plans/generate", {
      method: "POST",
      body: JSON.stringify({ date, overwriteApproved, userId }),
    });
  },

  async approvePlan(planId: string, userId?: string): Promise<{ plan: Plan }> {
    return request("/api/plans/approve", {
      method: "POST",
      body: JSON.stringify({ planId, userId }),
    });
  },

  // Adaptive Replanning (Stage 4)
  async previewReplan(options: {
    date: string;
    delayedEvents?: Array<{ eventId: string; title?: string; delayMinutes?: number }>;
    extendedTasks?: Array<{ taskId: string; extendedMinutes: number }>;
    preservedTaskIds?: string[];
    pinnedTaskIds?: string[];
    reason?: string;
    whatIf?: boolean;
    userId?: string;
  }): Promise<PreviewReplanResult> {
    return request("/api/plans/replan/preview", {
      method: "POST",
      body: JSON.stringify(options),
    });
  },

  async comparePlans(
    basePlanId: string,
    targetPlanId: string,
    userId?: string
  ): Promise<{ diff: PlanComparisonResult }> {
    return request("/api/plans/replan/compare", {
      method: "POST",
      body: JSON.stringify({ basePlanId, targetPlanId, userId }),
    });
  },

  async commitPlan(
    planId: string,
    expectedVersion?: number,
    userId?: string
  ): Promise<{ success: boolean; planId: string; version: number; message: string }> {
    return request("/api/plans/replan/commit", {
      method: "POST",
      body: JSON.stringify({ planId, expectedVersion, userId }),
    });
  },

  async rejectPlan(
    planId: string,
    reason?: string,
    userId?: string
  ): Promise<{ success: boolean; planId: string; status: string; message: string }> {
    return request("/api/plans/replan/reject", {
      method: "POST",
      body: JSON.stringify({ planId, reason, userId }),
    });
  },

  async rollbackPlan(
    date: string,
    targetVersion?: number,
    reason?: string,
    userId?: string
  ): Promise<{ success: boolean; planId: string; version: number; message: string }> {
    return request("/api/plans/replan/rollback", {
      method: "POST",
      body: JSON.stringify({ date, targetVersion, reason, userId }),
    });
  },

  async getPlanHistory(date: string, userId?: string): Promise<{
    date: string;
    totalVersions: number;
    currentActiveVersion: number | null;
    currentActivePlanId: string | null;
    history: Array<{
      id: string;
      version: number;
      status: string;
      replanReason: string | null;
      parentPlanId: string | null;
      itemCount: number;
      createdAt: string;
      updatedAt: string;
      items: any[];
    }>;
  }> {
    const q = new URLSearchParams({ date });
    if (userId) q.set("userId", userId);
    return request(`/api/plans/history?${q.toString()}`);
  },

  // Conversational Assistant
  async sendChatMessage(params: {
    message: string;
    conversationId?: string;
    userId?: string;
    date?: string;
  }): Promise<{
    success: boolean;
    conversationId: string;
    content: string;
    actionsExecuted: Array<{
      tool: string;
      arguments: any;
      success: boolean;
      result: any;
      timestamp: string;
    }>;
  }> {
    return request("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  // Activity Feed
  async getActivity(userId?: string, limit: number = 30): Promise<{ activities: ActionHistory[] }> {
    const q = new URLSearchParams({ limit: limit.toString() });
    if (userId) q.set("userId", userId);
    return request(`/api/activity?${q.toString()}`);
  },

  // Demo Seeder
  async seedDemo(userId?: string, date: string = "2026-10-22"): Promise<{
    success: boolean;
    message: string;
    labEventId: string;
    tasks: Task[];
    planId: string;
  }> {
    return request("/api/seed-demo", {
      method: "POST",
      body: JSON.stringify({ userId, date }),
    });
  },
};
