import OpenAI from 'openai';
import type {
  AgentChatMessage,
  AgentStreamEvent,
  AgentToolCall,
  Endpoint,
} from '../../shared/types';
import { executeTool } from './tool-executor';
import { toolRegistry, setBrowserContextKey, cleanupBrowserSession } from './tool-registry';
import { buildSystemPrompt, supportsNativeToolCalling } from './agent-harness';

type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam;

function convertToOpenAIMessages(messages: AgentChatMessage[]): OpenAIMessage[] {
  return messages.map((msg): OpenAIMessage => {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId ?? '',
        content: msg.content,
      };
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    return {
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    };
  });
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

const MAX_TOOL_ITERATIONS = 5;
const MAX_TOOL_CALLS_PER_TURN = 10; // Cap tool calls per model turn — prevents runaway models (e.g. Gemma 4 spamming 600+)

export async function streamAgentChat(
  endpoint: Endpoint,
  modelId: string,
  messages: AgentChatMessage[],
  enableTools: boolean,
  signal: AbortSignal,
  onEvent: (event: AgentStreamEvent) => void,
  contextKey?: string,
): Promise<void> {
  const client = new OpenAI({
    apiKey: endpoint.api_key,
    baseURL: endpoint.base_url,
    timeout: 120_000,
  });

  // Set browser context key for this run (per-conversation browser sessions)
  const browserKey = contextKey ?? `run-${Date.now()}`;
  setBrowserContextKey(browserKey);

  // Build model-specific system prompt with tool instructions
  const toolSchemas = enableTools ? toolRegistry.getSchemas() : [];
  const isNativeToolModel = supportsNativeToolCalling(modelId);
  const systemPrompt = buildSystemPrompt(
    modelId,
    toolSchemas.map((t) => ({
      name: t.function.name,
      description: t.function.description ?? '',
      parameters: (t.function.parameters ?? {}) as Record<string, unknown>,
    })),
    { enableTools },
  );

  // Mutable conversation that grows with tool results
  const conversation: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...convertToOpenAIMessages(messages),
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (signal.aborted) {
      onEvent({ type: 'error', message: 'Cancelled' });
      return;
    }

    let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
    try {
      // For native tool-calling models: pass tools via API
      // For XML models: tools are already in the system prompt
      const useNativeTools = enableTools && isNativeToolModel;
      stream = await client.chat.completions.create({
        model: modelId,
        messages: conversation,
        tools: useNativeTools ? toolSchemas : undefined,
        tool_choice: useNativeTools ? 'auto' : undefined,
        stream: true,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onEvent({ type: 'error', message: msg });
      return;
    }

    const pendingToolCalls = new Map<number, PendingToolCall>();
    let assistantContent = '';
    let finishReason: string | null = null;

    try {
      for await (const chunk of stream) {
        if (signal.aborted) {
          onEvent({ type: 'error', message: 'Cancelled' });
          return;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Accumulate text content
        if (delta?.content) {
          assistantContent += delta.content;
          onEvent({ type: 'text_delta', content: delta.content });
        }

        // Accumulate tool call fragments (same pattern as cliproxy.ts)
        // Cap at MAX_TOOL_CALLS_PER_TURN to prevent runaway models (Gemma 4 generates 600+)
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;

            // Stop accumulating if we've hit the cap
            if (idx >= MAX_TOOL_CALLS_PER_TURN && !pendingToolCalls.has(idx)) {
              continue;
            }

            if (!pendingToolCalls.has(idx)) {
              pendingToolCalls.set(idx, {
                id: tc.id ?? `call_${idx}`,
                name: '',
                arguments: '',
              });
            }

            const pending = pendingToolCalls.get(idx)!;
            if (tc.id) pending.id = tc.id;
            if (tc.function?.name) pending.name += tc.function.name;
            if (tc.function?.arguments) pending.arguments += tc.function.arguments;
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    } catch (error) {
      if (signal.aborted) {
        onEvent({ type: 'error', message: 'Cancelled' });
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      onEvent({ type: 'error', message: msg });
      return;
    }

    // No tool calls — we're done
    if (pendingToolCalls.size === 0) {
      onEvent({ type: 'done' });
      cleanupBrowserSession(browserKey);
      return;
    }

    // Has tool calls — execute them and loop
    if (finishReason !== 'tool_calls' && finishReason !== 'stop') {
      // Unexpected finish but we have pending tool calls — proceed anyway
    }

    // Build the assistant message with tool_calls to append to conversation
    const assistantToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
    const toolCallObjects: AgentToolCall[] = [];

    for (const [, pending] of pendingToolCalls) {
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = pending.arguments ? JSON.parse(pending.arguments) : {};
      } catch {
        parsedArgs = { raw: pending.arguments };
      }

      assistantToolCalls.push({
        id: pending.id,
        type: 'function',
        function: {
          name: pending.name,
          arguments: JSON.stringify(parsedArgs),
        },
      });

      const toolCall: AgentToolCall = {
        id: pending.id,
        name: pending.name,
        arguments: parsedArgs,
        status: 'running',
        startTime: Date.now(),
      };
      toolCallObjects.push(toolCall);

      onEvent({ type: 'tool_call_start', toolCall: { ...toolCall } });
    }

    // Append assistant message with tool calls
    conversation.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: assistantToolCalls,
    });

    // Execute all tool calls and collect results
    const toolResults = await Promise.all(
      toolCallObjects.map(async (tc) => {
        const result = await executeTool(tc.name, tc.arguments);
        const isError = result.startsWith('Error:') || result.startsWith('Tool error');
        onEvent({
          type: 'tool_call_done',
          toolCallId: tc.id,
          result: isError ? undefined : result,
          error: isError ? result : undefined,
        });
        return { id: tc.id, result };
      }),
    );

    // Append tool result messages to conversation
    for (const { id, result } of toolResults) {
      conversation.push({
        role: 'tool',
        tool_call_id: id,
        content: result,
      });
    }

    // Loop back to call the model again with tool results in context
  }

  // Exhausted max iterations — degrade gracefully instead of erroring
  // (Da Vinci: "biological deliberation doesn't error from thinking too long")
  onEvent({ type: 'done' });
  cleanupBrowserSession(browserKey);
}
