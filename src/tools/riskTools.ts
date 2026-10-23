import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeDeadlineRisks } from "../services/riskAnalysisService.js";
import { formatSuccessResponse, formatErrorResponse } from "../utils/errors.js";

export function registerRiskTools(server: McpServer): void {
  server.registerTool(
    "analyze_deadline_risks",
    {
      title: "Analyze Deadline Risks",
      description:
        "Evaluates deadline risks for long-term goals and pending tasks based on remaining work, available working hours from preferences, calendar events, and dependencies. Never invents probabilities; provides transparent, explicit mathematical reasoning.",
      inputSchema: {
        userId: z.string().optional().describe("Target user ID (defaults to demo user)"),
        asOfDate: z
          .string()
          .optional()
          .describe("Reference date/time for analysis in YYYY-MM-DD or ISO format (defaults to now)"),
        lookaheadDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Number of days ahead to inspect (default: 14)"),
      },
    },
    async (args) => {
      try {
        const report = await analyzeDeadlineRisks(args.userId, {
          asOfDate: args.asOfDate,
          lookaheadDays: args.lookaheadDays,
        });

        return formatSuccessResponse({
          evaluatedAt: report.evaluatedAt,
          summary: report.summary,
          risks: report.risks.map((r) => ({
            id: r.id,
            type: r.type,
            title: r.title,
            deadline: r.deadline,
            riskLevel: r.riskLevel,
            requiredWorkMinutes: r.requiredWorkMinutes,
            availableWorkMinutes: r.availableWorkMinutes,
            slackMinutes: r.slackMinutes,
            bufferPercentage: r.bufferPercentage,
            reasoning: r.reasoning,
            inputs: r.inputs,
            recommendations: r.recommendations,
          })),
        });
      } catch (error) {
        return formatErrorResponse(error);
      }
    }
  );
}
