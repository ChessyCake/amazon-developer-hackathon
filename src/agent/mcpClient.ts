import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../tools/register.js";
import { LLMToolDefinition, LLMToolCall, LLMFunctionParameters } from "./types.js";

export interface McpClientOptions {
  transport?: "in-memory" | "http";
  serverUrl?: string;
  serverInstance?: McpServer;
}

export class LifeOSMcpClient {
  private client: Client;
  private isConnected = false;
  private cleanupFn?: () => Promise<void>;

  constructor(private options: McpClientOptions = {}) {
    this.client = new Client(
      {
        name: "lifeos-agent-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    if (this.options.transport === "http") {
      const url = new URL(this.options.serverUrl || "http://127.0.0.1:3000/mcp");
      const transport = new StreamableHTTPClientTransport(url);
      await this.client.connect(transport);
      this.cleanupFn = async () => {
        await transport.close();
      };
    } else {
      // In-memory transport
      const mcpServer =
        this.options.serverInstance ||
        new McpServer({
          name: "lifeos-in-memory",
          version: "0.1.0",
        });

      if (!this.options.serverInstance) {
        registerAllTools(mcpServer);
      }

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      await Promise.all([
        this.client.connect(clientTransport),
        mcpServer.connect(serverTransport),
      ]);

      this.cleanupFn = async () => {
        await clientTransport.close();
        await serverTransport.close();
      };
    }

    this.isConnected = true;
  }

  async close(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.close();
      if (this.cleanupFn) {
        await this.cleanupFn();
      }
    } finally {
      this.isConnected = false;
    }
  }

  async listToolsForLLM(): Promise<LLMToolDefinition[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    const { tools } = await this.client.listTools();

    return tools.map((tool) => {
      // Input schema is JSON Schema object
      const schema = (tool.inputSchema || {}) as {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };

      const parameters: LLMFunctionParameters = {
        type: "object",
        properties: (schema.properties as any) || {},
        required: schema.required || [],
      };

      return {
        name: tool.name,
        description: tool.description || "",
        parameters,
      };
    });
  }

  async executeTool(toolCall: LLMToolCall): Promise<{
    success: boolean;
    data: unknown;
    rawText: string;
    isError?: boolean;
  }> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const result = await this.client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments,
      });

      const contentList = (result.content as any[]) || [];
      const firstTextContent = contentList.find(
        (c: any) => c.type === "text"
      ) as { type: "text"; text: string } | undefined;

      const rawText = firstTextContent?.text || JSON.stringify(result);
      let parsedData: any;
      let jsonText: string;

      try {
        parsedData = JSON.parse(rawText);
        jsonText = rawText;
      } catch {
        parsedData = {
          success: !result.isError,
          error: result.isError ? rawText : undefined,
          text: !result.isError ? rawText : undefined,
        };
        jsonText = JSON.stringify(parsedData);
      }

      const isError = Boolean(
        result.isError ||
          (parsedData && typeof parsedData === "object" && parsedData.error)
      );

      return {
        success: !isError,
        data: parsedData,
        rawText: jsonText,
        isError,
      };
    } catch (error: any) {
      const errMessage = error?.message || String(error);
      return {
        success: false,
        data: { error: errMessage, success: false },
        rawText: JSON.stringify({ error: errMessage, success: false }),
        isError: true,
      };
    }
  }
}
