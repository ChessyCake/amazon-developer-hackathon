import { LLMAdapter } from "../types.js";
import { GeminiAdapter } from "./geminiAdapter.js";
import { OpenAIAdapter } from "./openaiAdapter.js";
import { MockLLMAdapter } from "./mockAdapter.js";

export function createLLMAdapter(providerOverride?: string): LLMAdapter {
  const provider = (
    providerOverride ||
    process.env.LLM_PROVIDER ||
    (process.env.GEMINI_API_KEY ? "gemini" : "") ||
    (process.env.OPENAI_API_KEY ? "openai" : "") ||
    "gemini"
  ).toLowerCase();

  switch (provider) {
    case "gemini":
      return new GeminiAdapter();
    case "openai":
      return new OpenAIAdapter();
    case "mock":
      return new MockLLMAdapter();
    default:
      console.warn(`Unknown LLM provider '${provider}', defaulting to Gemini adapter.`);
      return new GeminiAdapter();
  }
}
