import { prisma, resolveUserId } from "../db/client.js";
import { getPreferences } from "../services/preferenceService.js";
import {
  LLMMessage,
  AgentRunOptions,
  AgentRunResult,
  AgentActionLog,
} from "./types.js";
import { buildLifeOSSystemPrompt } from "./prompt.js";
import { createLLMAdapter } from "./adapters/factory.js";
import { LifeOSMcpClient } from "./mcpClient.js";

const DEFAULT_MAX_ITERATIONS = 5;

/**
 * Executes a single user conversational request through the LifeOS Agent Loop.
 */
export async function runAgent(
  userMessage: string,
  options: AgentRunOptions = {}
): Promise<AgentRunResult> {
  const targetUserId = await resolveUserId(options.userId);
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const adapter = options.llmAdapter || createLLMAdapter();

  // 1. Fetch user context & preferences
  const userPrefs = await getPreferences(targetUserId);
  const timezone = userPrefs.timezone || "Asia/Kolkata";

  // Calculate current date string in user timezone
  let currentDate = options.date;
  if (!currentDate) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    currentDate = formatter.format(new Date()); // YYYY-MM-DD
  }

  // 2. Fetch or create conversation in database
  let conversationId = options.conversationId;
  if (conversationId) {
    const existingConv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!existingConv) {
      throw new Error(`Conversation not found with id: ${conversationId}`);
    }
  } else {
    const newConv = await prisma.conversation.create({
      data: {
        userId: targetUserId,
        title: userMessage.slice(0, 50),
      },
    });
    conversationId = newConv.id;
  }

  // Record incoming user message in database
  await prisma.conversationMessage.create({
    data: {
      conversationId,
      role: "user",
      content: userMessage,
    },
  });

  // 3. Assemble LLM message history
  const dbMessages = await prisma.conversationMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  const systemPrompt = buildLifeOSSystemPrompt({
    currentDate,
    timezone,
  });

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...dbMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "tool",
      content: m.content,
      toolCallId: m.toolCallId || undefined,
      toolCalls: (m.toolCalls as any) || undefined,
    })),
  ];

  // 4. Initialize MCP Client & retrieve tools
  const mcpClient = new LifeOSMcpClient({ transport: "in-memory" });
  await mcpClient.connect();

  const actionsExecuted: AgentActionLog[] = [];
  let iterations = 0;
  let finalResponse = "";
  let completedSuccessfully = false;
  let executionError: string | undefined;

  try {
    const tools = await mcpClient.listToolsForLLM();

    while (iterations < maxIterations) {
      iterations++;

      // Call LLM adapter
      const response = await adapter.chat(messages, tools);

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Assistant wants to invoke tools
        messages.push({
          role: "assistant",
          content: response.content || null,
          toolCalls: response.toolCalls,
        });

        await prisma.conversationMessage.create({
          data: {
            conversationId,
            role: "assistant",
            content: response.content || null,
            toolCalls: response.toolCalls as any,
          },
        });

        // Execute each requested tool call
        for (const toolCall of response.toolCalls) {
          // Ensure ownership default: attach userId if not provided
          if (!toolCall.arguments.userId) {
            toolCall.arguments.userId = targetUserId;
          }

          const execResult = await mcpClient.executeTool(toolCall);

          actionsExecuted.push({
            tool: toolCall.name,
            arguments: toolCall.arguments,
            success: execResult.success,
            result: execResult.data,
            timestamp: new Date().toISOString(),
          });

          // Log ActionHistory entry for activity feed
          await prisma.actionHistory.create({
            data: {
              userId: targetUserId,
              actionType: "AGENT_TOOL_CALL",
              entityType: "MCP_TOOL",
              entityId: toolCall.name,
              payload: {
                conversationId,
                toolName: toolCall.name,
                arguments: toolCall.arguments,
                success: execResult.success,
                isError: execResult.isError,
              },
            },
          });

          // Add tool result to conversation messages for LLM
          messages.push({
            role: "tool",
            content: execResult.rawText,
            toolCallId: toolCall.id,
          });

          await prisma.conversationMessage.create({
            data: {
              conversationId,
              role: "tool",
              content: execResult.rawText,
              toolCallId: toolCall.id,
            },
          });
        }
      } else {
        // Assistant produced final answer without further tool calls
        finalResponse = response.content || "I have completed your request.";
        completedSuccessfully = true;

        await prisma.conversationMessage.create({
          data: {
            conversationId,
            role: "assistant",
            content: finalResponse,
          },
        });

        break;
      }
    }

    if (!completedSuccessfully && iterations >= maxIterations) {
      finalResponse = `I reached the maximum allowable steps (${maxIterations}) while processing your request. Here are the actions taken so far.`;
      completedSuccessfully = false;
    }
  } catch (error: any) {
    executionError = error?.message || String(error);
    finalResponse = `An error occurred while processing your request: ${executionError}`;
    completedSuccessfully = false;
  } finally {
    await mcpClient.close();
  }

  return {
    response: finalResponse,
    conversationId,
    iterations,
    actionsExecuted,
    completedSuccessfully,
    error: executionError,
  };
}
