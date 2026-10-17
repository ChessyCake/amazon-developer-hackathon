import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPreferences, updatePreferences } from "../services/preferenceService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerPreferenceTools(server: McpServer): void {
  // 6. get_preferences
  server.registerTool(
    "get_preferences",
    {
      title: "Get Preferences",
      description: "Get the scheduling preferences and timezone for a user.",
      inputSchema: {
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const prefs = await getPreferences(args.userId);
        return formatSuccessResponse({
          preferences: {
            focusMinutes: prefs.focusMinutes,
            breakMinutes: prefs.breakMinutes,
            workStartTime: prefs.workStartTime,
            workEndTime: prefs.workEndTime,
            bufferMinutes: prefs.bufferMinutes,
            timezone: prefs.timezone,
            updatedAt: prefs.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );

  // 7. update_preferences
  server.registerTool(
    "update_preferences",
    {
      title: "Update Preferences",
      description:
        "Update focus/break durations, working hours, buffer minutes, or timezone for a user.",
      inputSchema: {
        focusMinutes: z.number().int().min(5).max(240).optional().describe("Focus duration in minutes (5-240)"),
        breakMinutes: z.number().int().min(1).max(120).optional().describe("Break duration in minutes (1-120)"),
        workStartTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format").optional().describe("Work start time in HH:MM (24-hour)"),
        workEndTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format").optional().describe("Work end time in HH:MM (24-hour)"),
        bufferMinutes: z.number().int().min(0).max(60).optional().describe("Buffer between slots in minutes (0-60)"),
        timezone: z.string().optional().describe("IANA Timezone (e.g. 'Asia/Kolkata')"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const updated = await updatePreferences({
          userId: args.userId,
          focusMinutes: args.focusMinutes,
          breakMinutes: args.breakMinutes,
          workStartTime: args.workStartTime,
          workEndTime: args.workEndTime,
          bufferMinutes: args.bufferMinutes,
          timezone: args.timezone,
        });

        return formatSuccessResponse({
          message: "Preferences updated successfully",
          preferences: {
            focusMinutes: updated.focusMinutes,
            breakMinutes: updated.breakMinutes,
            workStartTime: updated.workStartTime,
            workEndTime: updated.workEndTime,
            bufferMinutes: updated.bufferMinutes,
            timezone: updated.timezone,
            updatedAt: updated.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
