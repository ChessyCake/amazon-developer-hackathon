import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "./src/tools/register.js";
import { apiRouter } from "./src/routes/api.js";
import { prisma } from "./src/db/client.js";

const app = express();

// Production Request Logger (Method, URL, Status, Latency - zero sensitive data logged)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== "test") {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`);
    }
  });
  next();
});

// Security: Enforce 1MB payload size limit to prevent memory exhaustion DoS
app.use(express.json({ limit: "1mb" }));

// Security Headers & Cross-Origin Protections
app.use((_req, res, next) => {
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("Referrer-Policy", "strict-origin-when-cross-origin");
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Security: In-Memory Request Rate Limiter (300 requests / min / IP)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 300;

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
  } else {
    record.count++;
    if (record.count > MAX_REQUESTS_PER_WINDOW) {
      res.status(429).json({
        success: false,
        error: "Too Many Requests: Rate limit exceeded. Please try again shortly.",
      });
      return;
    }
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

// Register all LifeOS Stage 1, 2, 4, and 6 MCP tools
registerAllTools(server);

// Production Health Check: Verifies service status and live PostgreSQL connectivity
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "healthy",
      service: "lifeos-mcp",
      database: "connected",
      version: "0.1.0",
      transport: "StreamableHTTP",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: "unhealthy",
      service: "lifeos-mcp",
      database: "disconnected",
      error: error?.message || "Database connection error",
      timestamp: new Date().toISOString(),
    });
  }
});

// MCP Discovery Metadata Endpoint
app.get("/mcp", (_req, res) => {
  res.json({
    name: "lifeos",
    version: "0.1.0",
    protocolVersion: "2024-11-05",
    description: "LifeOS Personal AI Planning Agent MCP Endpoint",
    transport: "StreamableHTTP",
    usage: {
      method: "POST",
      endpoint: "/mcp",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      supportedOperations: ["tools/list", "tools/call"],
    },
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

// Centralized Production-Safe Error Handler (Suppresses credentials & stack traces)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    res.status(413).json({
      success: false,
      error: "Payload too large. Maximum allowable request size is 1MB.",
    });
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const statusCode =
    typeof err.status === "number" && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  const safeMessage =
    isProd && statusCode === 500
      ? "Internal server error"
      : err.message || "An unexpected error occurred";

  if (!res.headersSent) {
    res.status(statusCode).json({
      success: false,
      error: safeMessage,
    });
  }
});

const port = Number(process.env.PORT ?? 3000);

export { app, server };

const host = process.env.HOST ?? "0.0.0.0";
const isTesting =
  process.env.NODE_ENV === "test" ||
  process.env.npm_lifecycle_event === "test" ||
  process.argv.some((arg) => arg.includes("--test") || arg.includes("test"));

if (!isTesting) {
  app.listen(port, host, () => {
    console.log(`LifeOS MCP server running on http://${host}:${port}`);
    console.log(`MCP endpoint: http://${host}:${port}/mcp`);
  });
}
