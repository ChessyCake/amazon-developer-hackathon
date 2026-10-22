import { LLMAdapter, LLMMessage, LLMResponse, LLMToolDefinition } from "../types.js";

export type MockHandler = (
  messages: LLMMessage[],
  tools: LLMToolDefinition[]
) => Promise<LLMResponse> | LLMResponse;

export class MockLLMAdapter implements LLMAdapter {
  public providerName = "mock";
  private handlers: MockHandler[] = [];
  private callCount = 0;

  constructor(handlers?: MockHandler[] | MockHandler) {
    if (handlers) {
      this.handlers = Array.isArray(handlers) ? handlers : [handlers];
    }
  }

  setHandlers(handlers: MockHandler[]): void {
    this.handlers = handlers;
    this.callCount = 0;
  }

  addHandler(handler: MockHandler): void {
    this.handlers.push(handler);
  }

  getCallCount(): number {
    return this.callCount;
  }

  async chat(messages: LLMMessage[], tools: LLMToolDefinition[]): Promise<LLMResponse> {
    if (this.callCount >= this.handlers.length) {
      // Default fallback response
      return {
        content: "I have processed your request based on the available tools.",
        toolCalls: undefined,
        finishReason: "stop",
      };
    }

    const handler = this.handlers[this.callCount++];
    return handler(messages, tools);
  }
}
