import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDailyBriefing } from "../services/briefingService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerBriefingTools(server: McpServer): void {
  server.registerTool(
    "get_daily_briefing",
    {
      title: "Get Daily Briefing",
      description:
        "Generates an executive daily briefing summarizing today's commitments, focus blocks, meetings, overdue tasks, conflicts, and deadline risks strictly from actual stored records.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Date in YYYY-MM-DD format (defaults to today)"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const briefing = await getDailyBriefing(args.userId, args.date);
        return formatSuccessResponse({ briefing });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
