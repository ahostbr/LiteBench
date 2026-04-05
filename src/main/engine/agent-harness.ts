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
/**
 * Detect if model is likely very small (sub-2B) based on name patterns.
 * Small models need simpler prompts and concrete examples.
 */
export function isSmallModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return /\b(0\.\d+b|0\.8b|1b|1\.5b|752m|500m)\b/.test(lower) ||
    lower.includes('0.8b') || lower.includes('0.5b');
}

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
  const small = isSmallModel(modelId);

  if ((isNative || !enableTools) && !small) {
    return buildNativeSystemPrompt(modelId, options?.customInstructions);
  }

  // Small models get a compact native prompt with a concrete example
  if (isNative && small) {
    return buildSmallModelPrompt(modelId, options?.customInstructions);
  }

  return buildXMLSystemPrompt(modelId, tools, options?.customInstructions);
}

/**
 * Minimal system prompt for models with native tool calling (~150 tokens).
 * Tools are passed via the OpenAI API's `tools` parameter.
 */
function buildNativeSystemPrompt(modelId: string, customInstructions?: string): string {
  const parts: string[] = [
    `You are an AI assistant with access to real, working tools. You can search the web, read web pages, browse websites, execute code, and more.`,
    ``,
    `## TOOL DISCIPLINE (CRITICAL — READ THIS CAREFULLY)`,
    ``,
    `Call exactly ONE tool at a time. After each tool call, STOP generating and wait for the result.`,
    ``,
    `Rules:`,
    `- ONE tool per message. Never call 2+ tools in the same response.`,
    `- NEVER repeat a tool call. If you already called web_search with a query, do NOT call it again.`,
    `- NEVER call the same tool more than once unless the arguments are completely different.`,
    `- After receiving a tool result, either: (a) call a DIFFERENT tool, or (b) write your final answer.`,
    `- Maximum 3 tool calls per task. Plan your tool use efficiently.`,
    ``,
    `## RESPONDING WITH TOOL RESULTS (MANDATORY)`,
    ``,
    `After your final tool call returns a result, you MUST write a text response to the user.`,
    `Do NOT end your turn with just a tool call — always follow up with a written answer.`,
    ``,
    `In your response:`,
    `- Include specific data from the tool result (titles, names, numbers, URLs).`,
    `- Format lists as numbered items (1. 2. 3.).`,
    `- For code execution: state the output value explicitly (e.g. "The output is 55").`,
    `- If a tool returned an error, explain what happened and what the result means.`,
    `- NEVER produce an empty response. Always write at least one sentence.`,
    ``,
    `## BROWSING WORKFLOW`,
    ``,
    `To read a website:`,
    `1. Call browser_navigate with the URL → page loads, you get the title back.`,
    `2. Call browser_read_page → you get the page text and clickable elements.`,
    `3. Write your answer using the page content. Done.`,
    ``,
    `Do NOT call browser_navigate twice. Do NOT call browser_read_page without navigating first.`,
    ``,
    `## TOOL SELECTION`,
    `| Task | Tool |`,
    `|------|------|`,
    `| Search for information | web_search (query) |`,
    `| Read a specific URL | web_fetch (url) |`,
    `| Browse & interact with a site | browser_navigate → browser_read_page |`,
    `| Run code | sandbox (code + language) |`,
    `| YouTube video | youtube (url) |`,
    ``,
    `## RULES`,
    `- NEVER say "I cannot access" or "I'm unable to browse" — you have real tools that work.`,
    `- Use the native function calling API. Do NOT write tool calls as text or XML.`,
  ];

  if (customInstructions) {
    parts.push('', `## Custom Instructions`, customInstructions);
  }

  return parts.join('\n');
}

/**
 * Ultra-compact prompt for small models (sub-2B).
 * Fewer rules, concrete example, direct language.
 */
function buildSmallModelPrompt(modelId: string, customInstructions?: string): string {
  const parts: string[] = [
    `You have tools. Use them to answer questions. Do NOT make up answers.`,
    ``,
    `RULES:`,
    `1. Call ONE tool, wait for result, then answer.`,
    `2. ALWAYS write a text answer after getting tool results.`,
    `3. Include real data from tool results in your answer.`,
    `4. Never say "I cannot" — use your tools instead.`,
    ``,
    `TOOLS:`,
    `- web_search: search Google. Args: {"query":"..."}`,
    `- web_fetch: read a URL. Args: {"action":"fetch","url":"..."}`,
    `- browser_navigate: open URL in browser. Args: {"url":"..."}`,
    `- browser_read_page: read current page content. No args.`,
    `- sandbox: run code. Args: {"action":"execute","code":"...","language":"python"}`,
    ``,
    `EXAMPLE:`,
    `User: "What is on example.com?"`,
    `→ You call browser_navigate({"url":"https://example.com"})`,
    `→ Result: "Page loaded: Example Domain"`,
    `→ You call browser_read_page()`,
    `→ Result: page text`,
    `→ You write: "Example.com contains a page titled Example Domain. It says..."`,
  ];

  if (customInstructions) {
    parts.push('', customInstructions);
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
 * Handles multiple formats that different models produce:
 *  - <tool_call><name>X</name><arguments>{...}</arguments></tool_call>
 *  - [TOOL_REQUEST] {"name": "X", "arguments": {...}} [END_...]
 *  - {"name": "X", "arguments": {...}}  (bare JSON tool call)
 *
 * Returns the clean text (without tool call blocks) and parsed tool calls.
 */
export function parseXMLToolCalls(text: string): {
  cleanText: string;
  toolCalls: ParsedToolCall[];
} {
  const toolCalls: ParsedToolCall[] = [];
  let cleanText = text;

  // Pattern 1: Standard XML <tool_call> format
  const xmlRegex = /<tool_call>\s*<name>(.*?)<\/name>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = xmlRegex.exec(text)) !== null) {
    const name = match[1].trim();
    const argsStr = match[2].trim();
    let args: Record<string, unknown>;
    try { args = JSON.parse(argsStr); } catch { args = { raw: argsStr }; }
    toolCalls.push({ name, arguments: args });
    cleanText = cleanText.replace(match[0], '');
  }

  // Pattern 2: [TOOL_REQUEST] {"name": "X", "arguments": {...}} [END_...]
  const bracketRegex = /\[TOOL_REQUEST\]\s*(\{[\s\S]*?\})\s*\[END_\w*\]/g;
  while ((match = bracketRegex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1]);
      if (obj.name) {
        toolCalls.push({
          name: obj.name,
          arguments: obj.arguments || obj.params || {},
        });
        cleanText = cleanText.replace(match[0], '');
      }
    } catch { /* skip malformed */ }
  }

  // Pattern 3: Bare JSON tool calls — {"name": "tool_name", "arguments": {...}}
  // Only if no tool calls found yet (avoid false positives)
  if (toolCalls.length === 0) {
    const jsonRegex = /\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
    while ((match = jsonRegex.exec(text)) !== null) {
      const name = match[1];
      let args: Record<string, unknown>;
      try { args = JSON.parse(match[2]); } catch { args = { raw: match[2] }; }
      toolCalls.push({ name, arguments: args });
      cleanText = cleanText.replace(match[0], '');
    }
  }

  return { cleanText: cleanText.trim(), toolCalls };
}

/**
 * Check if accumulated text contains a partial (incomplete) tool call.
 * Used during streaming to avoid yielding text that's part of an XML tool call.
 */
export function hasPartialToolCall(text: string): boolean {
  // Check for opening tag without closing
  if (text.lastIndexOf('<tool_call>') > text.lastIndexOf('</tool_call>')) return true;
  if (text.lastIndexOf('[TOOL_REQUEST]') > text.lastIndexOf('[END_')) return true;
  return false;
}
