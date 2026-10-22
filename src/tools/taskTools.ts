import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createTask,
  listTasks,
  updateTask,
  completeTask,
  deleteTask,
} from "../services/taskService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

const TaskPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const TaskStatusEnum = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
const TaskStatusFilterEnum = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "ALL"]);

export function registerTaskTools(server: McpServer): void {
  // 1. create_task
  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description:
        "Create a new task with title, description, duration in minutes, priority, deadline, tags, and user ownership.",
      inputSchema: {
        title: z.string().min(1, "Task title is required"),
        description: z.string().optional(),
        duration: z.number().int().positive().optional().describe("Duration in minutes (default 30)"),
        priority: TaskPriorityEnum.optional().describe("Task priority: LOW, MEDIUM, HIGH, URGENT (default MEDIUM)"),
        deadline: z.string().optional().describe("Deadline as ISO-8601 string or date"),
        tags: z.array(z.string()).optional().describe("List of string tags for categorization"),
        dependencies: z.array(z.string()).optional().describe("List of task IDs that must be completed first"),
        allowSplitting: z.boolean().optional().describe("Whether this task can be split across slots"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const task = await createTask({
          userId: args.userId,
          title: args.title,
          description: args.description,
          duration: args.duration,
          priority: args.priority,
          deadline: args.deadline,
          tags: args.tags,
          dependencies: args.dependencies,
          allowSplitting: args.allowSplitting,
        });

        return formatSuccessResponse({
          message: "Task created successfully",
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            duration: task.duration,
            priority: task.priority,
            deadline: task.deadline?.toISOString() ?? null,
            status: task.status,
            tags: task.tags,
            dependencies: task.dependencies,
            allowSplitting: task.allowSplitting,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 2. list_tasks
  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description:
        "List tasks for a user with optional filters for status, priority, tag, or due date.",
      inputSchema: {
        status: TaskStatusFilterEnum.optional().describe("Filter by status (or 'ALL')"),
        priority: TaskPriorityEnum.optional().describe("Filter by priority"),
        tag: z.string().optional().describe("Filter by tag"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional().describe("Filter tasks due on YYYY-MM-DD in user timezone"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const tasks = await listTasks({
          userId: args.userId,
          status: args.status,
          priority: args.priority,
          tag: args.tag,
          date: args.date,
        });

        return formatSuccessResponse({
          count: tasks.length,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            duration: t.duration,
            priority: t.priority,
            deadline: t.deadline?.toISOString() ?? null,
            status: t.status,
            tags: t.tags,
            dependencies: t.dependencies,
            allowSplitting: t.allowSplitting,
            completedAt: t.completedAt?.toISOString() ?? null,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
          })),
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 3. update_task
  server.registerTool(
    "update_task",
    {
      title: "Update Task",
      description:
        "Update an existing task's title, description, duration, priority, deadline, status, tags, dependencies, or allowSplitting.",
      inputSchema: {
        id: z.string().min(1, "Task ID is required"),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        duration: z.number().int().positive().optional(),
        priority: TaskPriorityEnum.optional(),
        deadline: z.string().nullable().optional().describe("ISO-8601 date string, or null to clear"),
        status: TaskStatusEnum.optional(),
        tags: z.array(z.string()).optional(),
        dependencies: z.array(z.string()).optional(),
        allowSplitting: z.boolean().optional(),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const updated = await updateTask({
          id: args.id,
          userId: args.userId,
          title: args.title,
          description: args.description,
          duration: args.duration,
          priority: args.priority,
          deadline: args.deadline,
          status: args.status,
          tags: args.tags,
          dependencies: args.dependencies,
          allowSplitting: args.allowSplitting,
        });

        return formatSuccessResponse({
          message: "Task updated successfully",
          task: {
            id: updated.id,
            title: updated.title,
            description: updated.description,
            duration: updated.duration,
            priority: updated.priority,
            deadline: updated.deadline?.toISOString() ?? null,
            status: updated.status,
            tags: updated.tags,
            dependencies: updated.dependencies,
            allowSplitting: updated.allowSplitting,
            completedAt: updated.completedAt?.toISOString() ?? null,
            updatedAt: updated.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 4. complete_task
  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a task as completed.",
      inputSchema: {
        id: z.string().min(1, "Task ID is required"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const completed = await completeTask(args.id, args.userId);

        return formatSuccessResponse({
          message: "Task completed successfully",
          task: {
            id: completed.id,
            title: completed.title,
            status: completed.status,
            completedAt: completed.completedAt?.toISOString() ?? null,
          },
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 5. delete_task
  server.registerTool(
    "delete_task",
    {
      title: "Delete Task",
      description: "Delete an existing task for the authorized user.",
      inputSchema: {
        id: z.string().min(1, "Task ID is required"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const result = await deleteTask(args.id, args.userId);
        return formatSuccessResponse({
          message: "Task deleted successfully",
          id: result.id,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
