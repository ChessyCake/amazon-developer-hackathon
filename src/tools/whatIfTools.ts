import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { simulateWhatIfPlans } from "../services/whatIfService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerWhatIfTools(server: McpServer): void {
  server.registerTool(
    "simulate_what_if_plans",
    {
      title: "Simulate What-If Schedules",
      description:
        "Compares Balanced, Deadline-First, and Goal-First schedules side-by-side without mutating or altering the committed plan.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Date in YYYY-MM-DD format (defaults to today)"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async (args) => {
      try {
        const report = await simulateWhatIfPlans(args.userId, args.date);
        return formatSuccessResponse({ report });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
