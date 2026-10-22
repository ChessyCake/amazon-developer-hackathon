import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  generateAndSavePlan,
  getPlan,
  approvePlan,
} from "../services/planService.js";
import {
  previewReplan,
  comparePlansService,
  commitPlan,
  rejectPlan,
  getPlanHistory,
  rollbackPlan,
} from "../services/replanService.js";
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

  // preview_replan (Stage 4)
  server.registerTool(
    "preview_replan",
    {
      title: "Preview Replan",
      description:
        "Preview a revised schedule when disruptions occur (e.g. event running late, task extended) while strictly protecting active plans and user constraints. Generates a structured diff and trade-off explanation without modifying the committed schedule.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
        delayedEvents: z
          .array(
            z.object({
              eventId: z.string().describe("Calendar event ID or unique title"),
              delayMinutes: z.number().optional().describe("Number of minutes the event ran late"),
              newStartTime: z.string().optional().describe("Updated start ISO timestamp"),
              newEndTime: z.string().optional().describe("Updated end ISO timestamp"),
              title: z.string().optional().describe("Event title match filter"),
            })
          )
          .optional()
          .describe("Fixed calendar events that were delayed or shifted"),
        extendedTasks: z
          .array(
            z.object({
              taskId: z.string(),
              extendedMinutes: z.number(),
            })
          )
          .optional()
          .describe("Tasks that took longer than estimated"),
        preservedTaskIds: z
          .array(z.string())
          .optional()
          .describe("IDs or titles of tasks that MUST be preserved in the schedule (e.g. 'Exam preparation')"),
        pinnedTaskIds: z
          .array(z.string())
          .optional()
          .describe("IDs of tasks that should stay fixed in time if possible"),
        reason: z.string().optional().describe("Human explanation for replan (e.g. 'Lab ran 1 hour late')"),
        whatIf: z
          .boolean()
          .optional()
          .describe("If true, perform hypothetical what-if planning comparison"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const result = await previewReplan({
          date: args.date,
          userId: args.userId,
          disruptions: {
            delayedEvents: args.delayedEvents,
            extendedTasks: args.extendedTasks,
            reason: args.reason,
          },
          constraints: {
            preservedTaskIds: args.preservedTaskIds,
            pinnedTaskIds: args.pinnedTaskIds,
          },
          whatIf: args.whatIf,
        });

        return formatSuccessResponse({
          message: "Replan preview generated successfully",
          proposedPlanId: result.proposedPlanId,
          proposedVersion: result.proposedVersion,
          basePlanId: result.basePlanId,
          baseVersion: result.baseVersion,
          replanReason: result.replanReason,
          diff: result.diff,
          tradeOffs: result.tradeOffs,
          unscheduledTasks: result.unscheduledTasks,
          isFeasible: result.isFeasible,
          isWhatIf: result.isWhatIf,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // compare_plans (Stage 4)
  server.registerTool(
    "compare_plans",
    {
      title: "Compare Plans",
      description:
        "Compares two plan versions and outputs a structured diff (added, moved, removed, unchanged) and trade-offs.",
      inputSchema: {
        basePlanId: z.string().min(1, "Base plan ID is required"),
        targetPlanId: z.string().min(1, "Target plan ID is required"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const diff = await comparePlansService({
          basePlanId: args.basePlanId,
          targetPlanId: args.targetPlanId,
          userId: args.userId,
        });

        return formatSuccessResponse({
          message: "Plan comparison completed",
          basePlanId: args.basePlanId,
          targetPlanId: args.targetPlanId,
          diff,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // commit_plan (Stage 4)
  server.registerTool(
    "commit_plan",
    {
      title: "Commit Plan",
      description:
        "Commit an approved plan proposal into ACTIVE status inside a database transaction. Associates approval with exact plan ID and version. Rejects stale approvals and concurrent modifications.",
      inputSchema: {
        planId: z.string().min(1, "Plan ID is required"),
        expectedVersion: z
          .number()
          .optional()
          .describe("Exact plan version reviewed by user to guard against stale updates"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const result = await commitPlan({
          planId: args.planId,
          expectedVersion: args.expectedVersion,
          userId: args.userId,
        });

        return formatSuccessResponse(result);
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // reject_plan (Stage 4)
  server.registerTool(
    "reject_plan",
    {
      title: "Reject Plan",
      description:
        "Reject a proposed replan. The proposed plan is marked REJECTED, leaving the previously committed ACTIVE schedule untouched.",
      inputSchema: {
        planId: z.string().min(1, "Plan ID is required"),
        reason: z.string().optional().describe("Reason for rejection"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const result = await rejectPlan({
          planId: args.planId,
          reason: args.reason,
          userId: args.userId,
        });

        return formatSuccessResponse(result);
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // get_plan_history (Stage 4)
  server.registerTool(
    "get_plan_history",
    {
      title: "Get Plan History",
      description:
        "Retrieve the complete audit history of all plan versions, statuses (ACTIVE, PROPOSED, SUPERSEDED, REJECTED), and timestamps for a date.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const history = await getPlanHistory(args.date, args.userId);
        return formatSuccessResponse(history);
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // rollback_plan (Stage 4 Compensating Undo)
  server.registerTool(
    "rollback_plan",
    {
      title: "Rollback Plan",
      description:
        "Safely restore a previous plan version using an explicit compensating database transaction.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
        targetVersion: z
          .number()
          .optional()
          .describe("Specific plan version to restore (defaults to previous superseded version)"),
        reason: z.string().optional().describe("Reason for rollback"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const result = await rollbackPlan({
          date: args.date,
          targetVersion: args.targetVersion,
          reason: args.reason,
          userId: args.userId,
        });

        return formatSuccessResponse(result);
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
