export interface LLMFunctionParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: {
    type: string;
    description?: string;
  };
  [key: string]: unknown;
}

export interface LLMFunctionParameters {
  type: "object";
  properties: Record<string, LLMFunctionParameterProperty>;
  required?: string[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: LLMFunctionParameters;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

export interface LLMResponse {
  content: string | null;
  toolCalls?: LLMToolCall[];
  finishReason?: string;
  raw?: unknown;
}

export interface LLMAdapter {
  providerName: string;
  chat(messages: LLMMessage[], tools: LLMToolDefinition[]): Promise<LLMResponse>;
}

export interface AgentActionLog {
  tool: string;
  arguments: Record<string, unknown>;
  success: boolean;
  result: unknown;
  timestamp: string;
}

export interface AgentRunOptions {
  userId?: string;
  conversationId?: string;
  maxIterations?: number;
  date?: string; // Target reference date (defaults to today in user timezone)
  llmAdapter?: LLMAdapter;
}

export interface AgentRunResult {
  response: string;
  conversationId: string;
  iterations: number;
  actionsExecuted: AgentActionLog[];
  completedSuccessfully: boolean;
  error?: string;
}
