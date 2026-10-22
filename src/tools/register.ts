import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools } from "./taskTools.js";
import { registerPreferenceTools } from "./preferenceTools.js";
import { registerContextTools } from "./contextTools.js";
import { registerPlanTools } from "./planTools.js";

/**
 * Registers all LifeOS MCP tools on the provided McpServer instance.
 */
export function registerAllTools(server: McpServer): void {
  registerTaskTools(server);
  registerPreferenceTools(server);
  registerContextTools(server);
  registerPlanTools(server);
}
