import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWeeklyReview } from "../services/reviewService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerReviewTools(server: McpServer): void {
  server.registerTool(
    "get_weekly_review",
    {
      title: "Get Weekly Review",
      description:
        "Generates a retrospective weekly review summarizing completed tasks, overdue items, planned-versus-actual time adherence, category breakdown, and next-week priorities from actual stored database records.",
      inputSchema: {
        weekStartDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Start date of the week in YYYY-MM-DD format (defaults to 7 days ago)"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const review = await getWeeklyReview(args.userId, args.weekStartDate);
        return formatSuccessResponse({ review });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
