import { LLMAdapter, LLMMessage, LLMResponse, LLMToolDefinition, LLMToolCall } from "../types.js";

export interface GeminiAdapterConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class GeminiAdapter implements LLMAdapter {
  public providerName = "gemini";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: GeminiAdapterConfig = {}) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || "";
    this.model = config.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
    this.baseUrl =
      config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/models";
  }

  async chat(messages: LLMMessage[], tools: LLMToolDefinition[]): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your environment or .env file."
      );
    }

    // Convert messages to Gemini contents format
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;
    const contents: Array<{
      role: "user" | "model";
      parts: Array<
        | { text: string }
        | { functionCall: { name: string; args: Record<string, unknown> } }
        | { functionResponse: { name: string; response: { content: unknown } } }
      >;
    }> = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        if (msg.content) {
          systemInstruction = { parts: [{ text: msg.content }] };
        }
      } else if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content || "" }],
        });
      } else if (msg.role === "assistant") {
        const parts: Array<
          | { text: string }
          | { functionCall: { name: string; args: Record<string, unknown> } }
        > = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }
      } else if (msg.role === "tool") {
        let parsedContent: unknown = msg.content;
        try {
          if (msg.content) parsedContent = JSON.parse(msg.content);
        } catch {
          parsedContent = { raw: msg.content };
        }

        contents.push({
          role: "user", // Gemini tool responses are placed in user role turn
          parts: [
            {
              functionResponse: {
                name: msg.toolCallId || "tool_result",
                response: { content: parsedContent },
              },
            },
          ],
        });
      }
    }

    // Format tools as Gemini function declarations
    const geminiTools =
      tools.length > 0
        ? [
            {
              functionDeclarations: tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
            },
          ]
        : undefined;

    const requestBody = {
      contents,
      systemInstruction,
      tools: geminiTools,
      generationConfig: {
        temperature: 0.2,
      },
    };

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error [${res.status}]: ${errText}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: { name: string; args: Record<string, unknown> };
          }>;
        };
        finishReason?: string;
      }>;
    };

    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content?.parts) {
      return { content: "", toolCalls: [], finishReason: "STOP" };
    }

    let textContent = "";
    const toolCalls: LLMToolCall[] = [];

    for (const part of candidate.content.parts) {
      if (part.text) {
        textContent += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    return {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: candidate.finishReason || "STOP",
      raw: data,
    };
  }
}
