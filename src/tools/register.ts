import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools } from "./taskTools.js";
import { registerPreferenceTools } from "./preferenceTools.js";
import { registerContextTools } from "./contextTools.js";
import { registerPlanTools } from "./planTools.js";
import { registerGoalTools } from "./goalTools.js";
import { registerRiskTools } from "./riskTools.js";
import { registerRecurringTools } from "./recurringTools.js";
import { registerBriefingTools } from "./briefingTools.js";
import { registerWhatIfTools } from "./whatIfTools.js";
import { registerReviewTools } from "./reviewTools.js";
import { registerFocusTools } from "./focusTools.js";

/**
 * Registers all LifeOS MCP tools on the provided McpServer instance.
 */
export function registerAllTools(server: McpServer): void {
  registerTaskTools(server);
  registerPreferenceTools(server);
  registerContextTools(server);
  registerPlanTools(server);
  registerGoalTools(server);
  registerRiskTools(server);
  registerRecurringTools(server);
  registerBriefingTools(server);
  registerWhatIfTools(server);
  registerReviewTools(server);
  registerFocusTools(server);
}

