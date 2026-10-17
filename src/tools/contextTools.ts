import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDayContext } from "../services/contextService.js";
import { formatErrorResponse } from "../utils/errors.js";

export function registerContextTools(server: McpServer): void {
  // 8. get_day_context
  server.registerTool(
    "get_day_context",
    {
      title: "Get Day Context",
      description:
        "Get the user's tasks, events and preferences for a given date.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
      },
    },
    async ({ date, userId }) => {
      try {
        const dayContext = await getDayContext(date, userId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(dayContext),
            },
          ],
        };
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
