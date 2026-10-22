import { LLMAdapter, LLMMessage, LLMResponse, LLMToolDefinition, LLMToolCall } from "../types.js";

export interface OpenAIAdapterConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIAdapter implements LLMAdapter {
  public providerName = "openai";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAIAdapterConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  }

  async chat(messages: LLMMessage[], tools: LLMToolDefinition[]): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not configured. Please set OPENAI_API_KEY in your environment or .env file."
      );
    }

    const openAiMessages = messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content || "",
          tool_call_id: m.toolCallId || "tool_call_1",
        };
      }
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: m.role,
        content: m.content || "",
      };
    });

    const openAiTools =
      tools.length > 0
        ? tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: openAiMessages,
      temperature: 0.2,
    };
    if (openAiTools) {
      body.tools = openAiTools;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error [${res.status}]: ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
        finish_reason?: string;
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      return { content: "", toolCalls: [], finishReason: "stop" };
    }

    const toolCalls: LLMToolCall[] = [];
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = { raw: tc.function.arguments };
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        });
      }
    }

    return {
      content: choice.message.content || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: choice.finish_reason || "stop",
      raw: data,
    };
  }
}
