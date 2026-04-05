/**
 * Agent Harness — Structured system prompts + model-specific tool calling.
 *
 * Ported from Kuroryuu Gateway's harness pattern:
 * - Provider-agnostic at the orchestration layer
 * - Model-specific at the prompting layer
 *
 * Key insight: Local models need very specific system prompts to use tools
 * reliably. Some support native OpenAI tool calling (Devstral, Qwen, Llama-3),
 * others need XML-style tool documentation embedded in the system prompt.
 *
 * This module provides:
 * 1. Model capability detection (native vs XML tool calling)
 * 2. System prompt generation (minimal for native, verbose for XML)
 * 3. Tool schema formatting per model type
 */

import type { AgentToolCall } from '../../shared/types';

// ── Model Capability Detection ──────────────────────────────────────────────

/**
 * Models known to support native OpenAI-compatible tool calling.
 * These get minimal system prompts and tools passed via the API.
 */
const NATIVE_TOOL_MODEL_PATTERNS = [
  'devstral',
  'mistral',
  'ministral',
  'qwen',
  'llama-3',
  'llama3',
  'llama-4',
  'llama4',
  'gemma-4',
  'gemma4',
  'command-r',
  'deepseek',
  'phi-4',
  'phi4',
];

/**
 * Check if a model supports native OpenAI-compatible tool calling.
 * If false, we embed XML tool documentation in the system prompt.
 */
export function supportsNativeToolCalling(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return NATIVE_TOOL_MODEL_PATTERNS.some((p) => lower.includes(p));
}

// ── System Prompt Builder ───────────────────────────────────────────────────

interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Build the system prompt for the agent, adapted to the model's capabilities.
 */
export function buildSystemPrompt(
  modelId: string,
  tools: ToolSchema[],
  options?: {
    enableTools?: boolean;
    customInstructions?: string;
  },
): string {
  const isNative = supportsNativeToolCalling(modelId);
  const enableTools = options?.enableTools ?? true;

  if (isNative || !enableTools) {
    return buildNativeSystemPrompt(modelId, options?.customInstructions);
  }

  return buildXMLSystemPrompt(modelId, tools, options?.customInstructions);
}

/**
 * Minimal system prompt for models with native tool calling (~150 tokens).
 * Tools are passed via the OpenAI API's `tools` parameter.
 */
function buildNativeSystemPrompt(modelId: string, customInstructions?: string): string {
  const parts: string[] = [
    `You are an AI assistant with access to tools. Use the provided tools to accomplish tasks.`,
    ``,
    `## Tool Use Guidelines`,
    `- Use the OpenAI function calling API for all tool calls.`,
    `- DO NOT output XML tags or write tool calls as prose. Use the native tool interface only.`,
    `- You may call multiple tools in sequence to complete complex tasks.`,
    `- After receiving tool results, synthesize the information into a helpful response.`,
    `- If a tool call fails, explain the error and try an alternative approach.`,
    ``,
    `## Available Tool Categories`,
    `- **Web Search**: Search the web for current information`,
    `- **Web Fetch**: Retrieve and read webpage content`,
    `- **YouTube**: Get video transcripts and information`,
    `- **Code Execution**: Run code in Python, JavaScript, and other languages`,
    `- **Browser**: Navigate and interact with web pages`,
    `- **Desktop Control**: Automate Windows desktop interactions (if armed)`,
  ];

  if (customInstructions) {
    parts.push('', `## Custom Instructions`, customInstructions);
  }

  return parts.join('\n');
}

/**
 * Verbose system prompt for models WITHOUT native tool calling (~2000+ tokens).
 * Tool definitions are embedded in the prompt as XML documentation.
 */
function buildXMLSystemPrompt(
  modelId: string,
  tools: ToolSchema[],
  customInstructions?: string,
): string {
  const toolDocs = tools.map((tool) => {
    const params = tool.parameters as { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
    const props = params.properties || {};
    const required = params.required || [];

    const paramLines = Object.entries(props).map(([name, def]) => {
      const req = required.includes(name) ? ' (required)' : ' (optional)';
      return `    - ${name}: ${def.type || 'string'}${req} — ${def.description || ''}`;
    });

    return [
      `<tool>`,
      `  <name>${tool.name}</name>`,
      `  <description>${tool.description}</description>`,
      `  <parameters>`,
      ...paramLines,
      `  </parameters>`,
      `</tool>`,
    ].join('\n');
  });

  const parts: string[] = [
    `You are an AI assistant with access to tools.`,
    ``,
    `## How to Use Tools`,
    ``,
    `When you need to use a tool, output a tool call in this exact XML format:`,
    ``,
    '```xml',
    `<tool_call>`,
    `<name>tool_name</name>`,
    `<arguments>{"param1": "value1", "param2": "value2"}</arguments>`,
    `</tool_call>`,
    '```',
    ``,
    `IMPORTANT:`,
    `- The arguments MUST be valid JSON`,
    `- You may call multiple tools by outputting multiple <tool_call> blocks`,
    `- After each tool call, you will receive the result in a <tool_result> block`,
    `- Use the tool results to formulate your final response`,
    ``,
    `## Available Tools`,
    ``,
    ...toolDocs,
  ];

  if (customInstructions) {
    parts.push('', `## Custom Instructions`, customInstructions);
  }

  return parts.join('\n');
}

// ── Tool Result Formatting ──────────────────────────────────────────────────

/**
 * Format a tool result for injection back into the conversation.
 * For native models, this is handled by the OpenAI API.
 * For XML models, we format as XML tags.
 */
export function formatToolResult(
  toolCallId: string,
  toolName: string,
  result: string,
  isError: boolean,
): string {
  if (isError) {
    return `Tool "${toolName}" failed: ${result}`;
  }
  return result;
}

// ── XML Tool Call Parser ────────────────────────────────────────────────────

interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Extract tool calls from model output text (for XML-mode models).
 * Returns the clean text (without tool call blocks) and parsed tool calls.
 */
export function parseXMLToolCalls(text: string): {
  cleanText: string;
  toolCalls: ParsedToolCall[];
} {
  const toolCalls: ParsedToolCall[] = [];
  const regex = /<tool_call>\s*<name>(.*?)<\/name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs;

  let cleanText = text;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    const argsStr = match[2].trim();

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr);
    } catch {
      args = { raw: argsStr };
    }

    toolCalls.push({ name, arguments: args });
    cleanText = cleanText.replace(match[0], '');
  }

  return { cleanText: cleanText.trim(), toolCalls };
}

/**
 * Check if accumulated text contains a partial (incomplete) tool call.
 * Used during streaming to avoid yielding text that's part of an XML tool call.
 */
export function hasPartialToolCall(text: string): boolean {
  // Check for opening tag without closing
  const openIdx = text.lastIndexOf('<tool_call>');
  if (openIdx === -1) return false;
  const closeIdx = text.indexOf('</tool_call>', openIdx);
  return closeIdx === -1;
}
