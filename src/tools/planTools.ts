import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  generateAndSavePlan,
  getPlan,
  approvePlan,
} from "../services/planService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerPlanTools(server: McpServer): void {
  // generate_plan
  server.registerTool(
    "generate_plan",
    {
      title: "Generate Daily Plan",
      description:
        "Generates a deterministic schedule for a date using real tasks, fixed calendar events, and preferences. Saves proposed plan as DRAFT.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
        overwriteApproved: z
          .boolean()
          .optional()
          .describe("Explicitly allow overwriting an existing ACTIVE/approved plan"),
      },
    },
    async (args) => {
      try {
        const result = await generateAndSavePlan({
          date: args.date,
          userId: args.userId,
          overwriteApproved: args.overwriteApproved,
        });

        return formatSuccessResponse({
          message: "Plan generated successfully",
          planId: result.planId,
          status: result.status,
          date: result.schedule.date,
          timezone: result.schedule.timezone,
          isFeasible: result.schedule.isFeasible,
          metrics: result.schedule.metrics,
          scheduledItems: result.schedule.scheduledItems.map((item) => ({
            order: item.order,
            itemType: item.itemType,
            title: item.title,
            startTime: item.startTime.toISOString(),
            endTime: item.endTime.toISOString(),
            durationMinutes: item.durationMinutes,
            taskId: item.taskId,
            part: item.part,
            totalParts: item.totalParts,
            explanation: item.explanation,
          })),
          unscheduledTasks: result.schedule.unscheduledTasks,
          freeSlotsRemaining: result.schedule.freeSlotsRemaining.map((slot) => ({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            durationMinutes: slot.durationMinutes,
          })),
          validation: result.schedule.validation,
          explanations: result.schedule.explanations,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // get_plan
  server.registerTool(
    "get_plan",
    {
      title: "Get Plan",
      description: "Retrieve the saved daily plan and its scheduled items for a given date.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const { plan } = await getPlan(args.date, args.userId);
        if (!plan) {
          return formatSuccessResponse({
            message: `No plan found for date ${args.date}`,
            plan: null,
          });
        }
        return formatSuccessResponse({ plan });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // approve_plan
  server.registerTool(
    "approve_plan",
    {
      title: "Approve Plan",
      description: "Approve a proposed DRAFT plan, transitioning it to ACTIVE status.",
      inputSchema: {
        planId: z.string().min(1, "Plan ID is required"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const result = await approvePlan(args.planId, args.userId);
        return formatSuccessResponse({
          message: "Plan approved successfully",
          plan: result.plan,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
