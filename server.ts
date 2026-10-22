import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "./src/tools/register.js";
import { apiRouter } from "./src/routes/api.js";

const app = express();
app.use(express.json());

// Enable CORS for frontend clients
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// REST API routes for frontend
app.use("/api", apiRouter);

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
