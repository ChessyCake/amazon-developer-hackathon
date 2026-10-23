import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createRecurringRule,
  listRecurringRules,
  generateRecurringTasks,
} from "../services/recurringService.js";
import { RecurrenceFrequency, TaskPriority } from "@prisma/client";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerRecurringTools(server: McpServer): void {
  server.registerTool(
    "create_recurring_rule",
    {
      title: "Create Recurring Routine Rule",
      description: "Creates an explicit recurring task rule for daily routines, weekday habits, or repeating commitments.",
      inputSchema: {
        title: z.string().min(1).describe("Title of recurring routine"),
        description: z.string().optional(),
        duration: z.number().min(5).default(30).describe("Duration in minutes"),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
        frequency: z.enum(["DAILY", "WEEKDAYS", "WEEKLY", "CUSTOM"]).default("DAILY"),
        daysOfWeek: z.array(z.number().min(0).max(6)).optional().describe("0=Sun, 1=Mon, ..., 6=Sat"),
        tags: z.array(z.string()).optional(),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const rule = await createRecurringRule({
          title: args.title,
          description: args.description,
          duration: args.duration,
          priority: args.priority as TaskPriority | undefined,
          frequency: args.frequency as RecurrenceFrequency,
          daysOfWeek: args.daysOfWeek,
          tags: args.tags,
          userId: args.userId,
        });

        return formatSuccessResponse({
          message: "Recurring rule created successfully",
          rule: {
            id: rule.id,
            title: rule.title,
            frequency: rule.frequency,
            duration: rule.duration,
            priority: rule.priority,
            daysOfWeek: rule.daysOfWeek,
          },
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "generate_recurring_tasks",
    {
      title: "Generate Recurring Task Occurrences",
      description: "Generates concrete, schedulable task instances for active recurring rules. Avoids duplicates strictly.",
      inputSchema: {
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Target date in YYYY-MM-DD"),
        horizonDays: z.number().int().min(1).max(30).default(1).describe("Number of days ahead to generate"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const result = await generateRecurringTasks(args.userId, args.targetDate, args.horizonDays);
        return formatSuccessResponse({
          message: `Generated ${result.generatedCount} recurring task occurrences`,
          date: result.date,
          generatedCount: result.generatedCount,
          tasks: result.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            duration: t.duration,
            deadline: t.deadline?.toISOString() || null,
            recurrenceDate: t.recurrenceDate,
          })),
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "list_recurring_rules",
    {
      title: "List Recurring Rules",
      description: "Lists all recurring routine rules configured for the user.",
      inputSchema: {
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const rules = await listRecurringRules(args.userId);
        return formatSuccessResponse({
          count: rules.length,
          rules,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
