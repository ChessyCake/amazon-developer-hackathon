import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "./src/tools/register.js";

const app = express();
app.use(express.json());

// Initialize the LifeOS MCP Server
const server = new McpServer({
  name: "lifeos",
  version: "0.1.0",
});

// Register all LifeOS Stage 1 MCP tools (tasks, preferences, day context)
registerAllTools(server);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "lifeos-mcp",
    timestamp: new Date().toISOString(),
  });
});

// Streamable HTTP MCP transport endpoint
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal MCP server error",
      });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);

export { app, server };

const host = process.env.HOST ?? "0.0.0.0";

if (process.env.NODE_ENV !== "test") {
  app.listen(port, host, () => {
    console.log(`LifeOS MCP server running on http://${host}:${port}`);
    console.log(`MCP endpoint: http://${host}:${port}/mcp`);
  });
}
