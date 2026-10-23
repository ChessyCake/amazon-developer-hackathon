import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  startFocusSession,
  recordInterruption,
  completeFocusSession,
  listFocusSessions,
} from "../services/focusSessionService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerFocusTools(server: McpServer): void {
  server.registerTool(
    "start_focus_session",
    {
      title: "Start Focus Session",
      description: "Starts a live focus session tracking deep work on a specific task.",
      inputSchema: {
        taskId: z.string().optional().describe("Associated task ID"),
        notes: z.string().optional().describe("Initial intent or goal for this session"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const session = await startFocusSession({
          taskId: args.taskId,
          notes: args.notes,
          userId: args.userId,
        });

        return formatSuccessResponse({
          message: "Focus session started",
          sessionId: session.id,
          startTime: session.startTime.toISOString(),
          taskTitle: session.task?.title || null,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "record_interruption",
    {
      title: "Record Session Interruption",
      description: "Logs an interruption (e.g. phone call, urgent question) during an active focus session.",
      inputSchema: {
        sessionId: z.string().describe("ID of the active focus session"),
        reason: z.string().optional().describe("Brief reason for the interruption"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const session = await recordInterruption(args.sessionId, args.userId, args.reason);
        return formatSuccessResponse({
          message: "Interruption recorded",
          sessionId: session.id,
          totalInterruptions: session.interruptionsCount,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  server.registerTool(
    "complete_focus_session",
    {
      title: "Complete Focus Session",
      description: "Concludes an active focus session, recording actual duration and optionally marking task complete.",
      inputSchema: {
        sessionId: z.string().describe("ID of the focus session to complete"),
        notes: z.string().optional().describe("Summary or accomplishment notes"),
        markTaskComplete: z.boolean().optional().describe("Whether to mark associated task as COMPLETED"),
        userId: z.string().optional().describe("Target user ID"),
      },
    },
    async (args) => {
      try {
        const session = await completeFocusSession({
          sessionId: args.sessionId,
          notes: args.notes,
          markTaskComplete: args.markTaskComplete,
          userId: args.userId,
        });

        return formatSuccessResponse({
          message: `Focus session completed (${session.durationMinutes} minutes)`,
          sessionId: session.id,
          actualDurationMinutes: session.durationMinutes,
          interruptions: session.interruptionsCount,
          taskCompleted: args.markTaskComplete ?? false,
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
