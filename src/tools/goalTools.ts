import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createGoal,
  listGoals,
  getGoal,
  decomposeGoal,
} from "../services/goalService.js";
import { GoalStatus, TaskPriority } from "@prisma/client";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerGoalTools(server: McpServer): void {
  // 1. create_goal
  server.registerTool(
    "create_goal",
    {
      title: "Create Goal",
      description: "Creates a new high-level goal with an optional target completion date.",
      inputSchema: {
        title: z.string().min(1).describe("The title of the high-level goal"),
        description: z.string().optional().describe("Detailed description of the goal"),
        targetDate: z.string().optional().describe("Target completion date in YYYY-MM-DD or ISO format"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const goal = await createGoal({
          title: args.title,
          description: args.description,
          targetDate: args.targetDate,
          userId: args.userId,
        });
        return formatSuccessResponse({
          message: "Goal created successfully",
          goal: {
            id: goal.id,
            title: goal.title,
            description: goal.description,
            targetDate: goal.targetDate?.toISOString() || null,
            status: goal.status,
          },
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 2. decompose_goal
  server.registerTool(
    "decompose_goal",
    {
      title: "Decompose Goal",
      description:
        "Decomposes a long-term goal into structured milestones and ordinary schedulable tasks with durations, deadlines, and dependencies.",
      inputSchema: {
        goalId: z.string().describe("The ID of the goal to decompose"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
        milestones: z
          .array(
            z.object({
              title: z.string().describe("Milestone title"),
              description: z.string().optional(),
              targetDate: z.string().optional(),
              order: z.number().optional(),
              tasks: z.array(
                z.object({
                  key: z.string().optional().describe("Local identifier for wiring dependencies (e.g. 'task-1')"),
                  title: z.string().describe("Task title"),
                  description: z.string().optional(),
                  duration: z.number().min(5).describe("Estimated duration in minutes"),
                  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
                  deadline: z.string().optional().describe("Task deadline (ISO or YYYY-MM-DD)"),
                  dependsOnKeys: z
                    .array(z.string())
                    .optional()
                    .describe("List of prerequisite task keys that must finish before this task starts"),
                  allowSplitting: z.boolean().optional(),
                  tags: z.array(z.string()).optional(),
                })
              ),
            })
          )
          .min(1)
          .describe("Milestones and nested tasks to create"),
      },
    },
    async (args) => {
      try {
        const result = await decomposeGoal({
          goalId: args.goalId,
          userId: args.userId,
          milestones: args.milestones.map((m) => ({
            title: m.title,
            description: m.description,
            targetDate: m.targetDate,
            order: m.order,
            tasks: m.tasks.map((t) => ({
              key: t.key,
              title: t.title,
              description: t.description,
              duration: t.duration,
              priority: t.priority as TaskPriority | undefined,
              deadline: t.deadline,
              dependsOnKeys: t.dependsOnKeys,
              allowSplitting: t.allowSplitting,
              tags: t.tags,
            })),
          })),
        });

        return formatSuccessResponse({
          message: `Goal decomposed into ${result.milestones.length} milestones and ${result.tasks.length} schedulable tasks`,
          goalId: result.goalId,
          goalTitle: result.goalTitle,
          milestonesCount: result.milestones.length,
          tasksCount: result.tasks.length,
          tasks: result.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            duration: t.duration,
            priority: t.priority,
            deadline: t.deadline?.toISOString() || null,
            dependencies: t.dependencies,
          })),
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 3. list_goals
  server.registerTool(
    "list_goals",
    {
      title: "List Goals",
      description: "Lists all goals with milestone counts, task completion metrics, and progress percentages.",
      inputSchema: {
        status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const goals = await listGoals(args.userId, args.status as GoalStatus | undefined);
        return formatSuccessResponse({
          count: goals.length,
          goals: goals.map((g) => ({
            id: g.id,
            title: g.title,
            description: g.description,
            targetDate: g.targetDate?.toISOString() || null,
            status: g.status,
            progressPercent: g.progressPercent,
            totalTasks: g.totalTasks,
            completedTasks: g.completedTasks,
            remainingMinutes: g.remainingMinutes,
            milestonesCount: g.totalMilestones,
          })),
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 4. get_goal
  server.registerTool(
    "get_goal",
    {
      title: "Get Goal Details",
      description: "Gets detailed information for a specific goal including all milestones and child tasks.",
      inputSchema: {
        id: z.string().describe("Goal ID"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const goal = await getGoal(args.id, args.userId);
        return formatSuccessResponse({ goal });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
