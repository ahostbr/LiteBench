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
    `1. Call browser_go with the URL → you get the title, URL, and page text back in ONE call.`,
    `2. If you need to interact (click a link, fill a form): call browser_elements() to see what's available.`,
    `3. Use browser_click(index) or browser_type(text, index) to interact.`,
    ``,
    `browser_go is the ONLY way to read a website. One call, one result.`,
    ``,
    `## TOOL SELECTION`,
    `| Task | Tool |`,
    `|------|------|`,
    `| Search for information | web_search (query) |`,
    `| Read a specific URL | browser_go (url) or web_fetch (url) |`,
    `| Browse & interact with a site | browser_go → browser_elements → browser_click/type |`,
    `| Run code | sandbox (code + language) |`,
    `| YouTube video | youtube (url) |`,
    `| Write HTML/CSS/JS files (Arena) | write_file (filename, content) |`,
    ``,
    `## TOOL ARGUMENT EXAMPLES (use these exact field names)`,
    ``,
    `sandbox: {"action": "execute", "code": "print(2+2)", "language": "python"}`,
    `web_search: {"query": "your search terms"}`,
    `browser_go: {"action": "go", "url": "https://example.com"}`,
    ``,
    `## RULES`,
    `- NEVER say "I cannot access" or "I'm unable to browse" — you have real tools that work.`,
    `- Use the native function calling API. Do NOT write tool calls as text or XML.`,
    `- ALWAYS include all required arguments. Never send empty {} args.`,
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
    `- web_search: search the web. Args: {"query":"..."}`,
    `- web_fetch: read a URL as text. Args: {"action":"fetch","url":"..."}`,
    `- browser_go: open URL and read content in ONE call. Args: {"url":"..."}`,
    `- browser_elements: list clickable elements on current page. No args.`,
    `- browser_click: click an element. Args: {"index":0}`,
    `- browser_type: type into an input. Args: {"text":"...","index":0}`,
    `- sandbox: run code. Args: {"action":"execute","code":"...","language":"python"}`,
    `- write_file: write HTML/CSS/JS to output dir (Arena only). Args: {"filename":"index.html","content":"..."}`,
    ``,
    `EXAMPLE:`,
    `User: "What is on example.com?"`,
    `→ You call browser_go({"url":"https://example.com"})`,
    `→ Result: "Title: Example Domain\nURL: https://example.com\n\nThis domain is for..."`,
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
  const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const toolDocs = tools.map((tool) => {
    const params = tool.parameters as { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
    const props = params.properties || {};
    const required = params.required || [];

    const paramLines = Object.entries(props).map(([name, def]) => {
      const req = required.includes(name) ? ' (required)' : ' (optional)';
      return `    - ${name}: ${def.type || 'string'}${req} — ${escXml(def.description || '')}`;
    });

    return [
      `<tool>`,
      `  <name>${escXml(tool.name)}</name>`,
      `  <description>${escXml(tool.description)}</description>`,
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
    `CRITICAL FORMAT RULES:`,
    `- You MUST use EXACTLY this XML format. No other format will be recognized.`,
    `- Do NOT use <|tool_call>, call:, or any other format. ONLY the XML shown above.`,
    `- The arguments MUST be valid JSON with quoted keys and values.`,
    `- After each tool call, you will receive the result in a <tool_result> block.`,
    `- Use the tool results to formulate your final response.`,
    ``,
    `EXAMPLE:`,
    `User: "Go to https://example.com and tell me what the page says."`,
    `You output:`,
    `<tool_call>`,
    `<name>browser_go</name>`,
    `<arguments>{"url": "https://example.com"}</arguments>`,
    `</tool_call>`,
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

  // Pattern 3: Distilled model format — <|tool_call>call:tool_name{...}<tool_call|>
  // Opus-distilled models bake in their own tool call format from training data
  const distillRegex = /<\|tool_call>call[>:]?\s*(\w+)\s*\{([\s\S]*?)\}\s*<\/?tool_call\|?>/g;
  while ((match = distillRegex.exec(text)) !== null) {
    const name = match[1].trim();
    const argsStr = '{' + match[2].trim() + '}';
    let args: Record<string, unknown>;
    try {
      // Try parsing as JSON first
      args = JSON.parse(argsStr);
    } catch {
      // Distilled models often emit pseudo-JSON with unquoted keys or special tokens
      // Try cleaning it up: remove <|"|> tokens, quote unquoted keys
      const cleaned = argsStr
        .replace(/<\|"\|>/g, '"')  // <|"|> → "
        .replace(/(\w+)\s*:/g, '"$1":')  // unquoted keys → quoted
        .replace(/,\s*}/g, '}');  // trailing commas
      try { args = JSON.parse(cleaned); } catch { args = { raw: match[2] }; }
    }
    toolCalls.push({ name, arguments: args });
    cleanText = cleanText.replace(match[0], '');
  }

  // Pattern 4: Bare JSON tool calls — {"name": "tool_name", "arguments": {...}}
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
  // Distilled model format: <|tool_call> without closing <tool_call|>
  if (text.lastIndexOf('<|tool_call>') > text.lastIndexOf('<tool_call|>')) return true;
  return false;
}
