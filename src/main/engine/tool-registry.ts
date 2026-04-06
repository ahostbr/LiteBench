import OpenAI from 'openai';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import {
  navigateTo,
  readPage,
  clickElement,
  typeText,
  getActiveSessionId,
  executeJS,
} from '../browser-manager';

/**
 * A registered tool entry — combines the OpenAI function schema with
 * the executor mapping used by tool-executor.ts.
 *
 * Two execution paths:
 *  - Python tools: set `module` + `handler`, leave `executor` undefined.
 *  - In-process tools (e.g. browser): set `executor`, leave `module`/`handler` undefined.
 */
export interface ToolRegistration {
  /** OpenAI function-calling schema sent to the model */
  schema: OpenAI.Chat.ChatCompletionTool;
  /** Python module name (relative to mcp-server/tools/) — Python path only */
  module?: string;
  /** Python handler function name inside that module — Python path only */
  handler?: string;
  /** In-process executor — IPC/browser path only. Receives tool args, returns a result string. */
  executor?: (args: Record<string, unknown>) => Promise<string>;
  /** Human-readable category for UI grouping */
  category: 'search' | 'code' | 'desktop' | 'browser' | 'media';
}

/**
 * Central tool registry for LiteBench.
 *
 * Tools register themselves here. agent-runner.ts reads the schemas,
 * tool-executor.ts reads the module/handler mappings.
 *
 * To add a new tool: call registerTool() — everything else wires up automatically.
 */
class ToolRegistry {
  private tools = new Map<string, ToolRegistration>();

  register(reg: ToolRegistration): void {
    const name = reg.schema.function.name;
    this.tools.set(name, reg);
  }

  /** All schemas as an array — passed directly to OpenAI chat.completions.create. */
  getSchemas(): OpenAI.Chat.ChatCompletionTool[] {
    return Array.from(this.tools.values()).map((r) => r.schema);
  }

  /** Executor mapping for a single tool name — used by tool-executor.ts */
  getExecutor(
    name: string,
  ): { module: string; handler: string } | { executor: (args: Record<string, unknown>) => Promise<string> } | undefined {
    const reg = this.tools.get(name);
    if (!reg) return undefined;
    if (reg.executor) return { executor: reg.executor };
    if (reg.module && reg.handler) return { module: reg.module, handler: reg.handler };
    return undefined;
  }

  /** Names of all registered tools */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Check if a tool is registered */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// ── Singleton registry ────────────────────────────────────────────────────────

export const toolRegistry = new ToolRegistry();

// ── Built-in tool registrations ───────────────────────────────────────────────

toolRegistry.register({
  category: 'search',
  schema: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web. Returns search results with titles, URLs, and snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
          },
        },
        required: ['query'],
      },
    },
  },
  executor: async (args) => {
    const query = args.query as string;
    const maxResults = (args.max_results as number) ?? 5;
    const sessionId = requireBrowserSession();

    // Navigate to DuckDuckGo HTML search (no CAPTCHA, no JS required)
    const encoded = encodeURIComponent(query);
    await navigateTo(sessionId, `https://html.duckduckgo.com/html/?q=${encoded}`);

    // Extract search results from the DDG HTML page
    const searchResults = await executeJS(sessionId, `(function() {
      const results = [];
      const items = document.querySelectorAll('.result');
      for (const item of items) {
        if (results.length >= ${maxResults}) break;
        const linkEl = item.querySelector('.result__a');
        const snippetEl = item.querySelector('.result__snippet');
        const urlEl = item.querySelector('.result__url');
        if (linkEl) {
          results.push({
            title: linkEl.textContent?.trim() || '',
            url: urlEl?.textContent?.trim() || linkEl.getAttribute('href') || '',
            snippet: snippetEl?.textContent?.trim()?.substring(0, 200) || '',
          });
        }
      }
      return results;
    })()`);

    const items = searchResults as Array<{ title: string; url: string; snippet: string }>;
    if (!items || items.length === 0) {
      // Fallback: return raw page text
      const page = await readPage(sessionId) as { visibleText: string; title: string };
      return `Search for "${query}" — results page loaded.\n\n${page.visibleText?.substring(0, 2000) || '(no results found)'}`;
    }

    const lines = [`Search results for "${query}":\n`];
    items.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.title}`);
      lines.push(`   ${item.url}`);
      if (item.snippet) lines.push(`   ${item.snippet}`);
      lines.push('');
    });

    return lines.join('\n');
  },
});

toolRegistry.register({
  category: 'search',
  module: 'web_fetch',
  handler: 'handle_web_fetch',
  schema: {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        'Fetch and extract text content from a URL. Use to read articles, documentation, or any web page.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['fetch', 'fetch_raw'],
            description: 'fetch returns parsed text, fetch_raw returns raw HTML/content',
          },
          url: {
            type: 'string',
            description: 'Full URL to fetch (https://...)',
          },
          max_length: {
            type: 'number',
            description: 'Maximum characters to return (default: 50000)',
          },
        },
        required: ['action', 'url'],
      },
    },
  },
});

toolRegistry.register({
  category: 'media',
  module: 'youtube',
  handler: 'handle_youtube',
  schema: {
    type: 'function',
    function: {
      name: 'youtube',
      description:
        'Fetch YouTube video transcripts or metadata. Use when the user provides a YouTube URL.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['transcript', 'info'],
            description: 'transcript returns the full caption text, info returns metadata',
          },
          url: {
            type: 'string',
            description: 'YouTube video URL',
          },
        },
        required: ['action', 'url'],
      },
    },
  },
});

toolRegistry.register({
  category: 'code',
  module: 'sandbox',
  handler: 'handle_sandbox',
  schema: {
    type: 'function',
    function: {
      name: 'sandbox',
      description:
        'Execute code in an isolated subprocess and return only stdout/stderr. Supports Python, JavaScript, TypeScript, Bash, PowerShell, Ruby, Go, Rust, Java, C, C++, PHP. Use when the agent needs to run computations, scripts, or verify logic.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['execute', 'execute_file', 'help'],
            description:
              'execute: run inline code. execute_file: run a file on disk. help: show usage.',
          },
          code: {
            type: 'string',
            description: 'Source code to execute. Required for execute action.',
          },
          language: {
            type: 'string',
            description:
              'Language name: python, javascript, typescript, bash, powershell, ruby, go, rust, java, c, cpp, php. Required for execute, auto-detected for execute_file.',
          },
          file_path: {
            type: 'string',
            description: 'Absolute path to file to execute. Required for execute_file action.',
          },
          timeout: {
            type: 'number',
            description: 'Max execution time in seconds (default: 30).',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for execution.',
          },
        },
        required: ['action'],
      },
    },
  },
});

// pccontrol removed — was half-finished Kuroryuu port, not needed for benchmarking

// ── write_file context manager ────────────────────────────────────────────────
// Per-run output directory — set by CompetitorRunner before agent starts,
// cleared after. Keyed by context key (same pattern as browser sessions).

const writeFileOutputDirs = new Map<string, string>();
let _activeWriteFileKey = '';

/** Set by CompetitorRunner before starting an agent run. */
export function setWriteFileContext(key: string, outputDir: string): void {
  writeFileOutputDirs.set(key, outputDir);
  _activeWriteFileKey = key;
}

/** Called by CompetitorRunner after completion to release the dir. */
export function clearWriteFileContext(key: string): void {
  writeFileOutputDirs.delete(key);
  if (_activeWriteFileKey === key) _activeWriteFileKey = '';
}

function getActiveOutputDir(): string | undefined {
  return writeFileOutputDirs.get(_activeWriteFileKey);
}

const ALLOWED_EXTENSIONS = new Set(['.html', '.css', '.js', '.svg', '.json', '.png', '.ico', '.txt']);

// ── Browser session manager ───────────────────────────────────────────────────
// Browser tools use the SINGLE visible browser session (the Browser panel).
// No invisible sessions — the user always sees what the agent is doing.

/** No-ops for backward compat with agent-runner cleanup calls */
export function setBrowserContextKey(_key: string): void {}
export function cleanupBrowserSession(_key: string): void {}

function requireBrowserSession(): string {
  const id = getActiveSessionId();
  if (!id) {
    throw new Error(
      'No browser panel open. Open the Browser panel from the activity bar first, then the agent can control it.',
    );
  }
  return id;
}

// ── Page data type for browser tools ──────────────────────────────────────────

interface PageData {
  url: string;
  title: string;
  elements: Array<{
    index: number;
    tag: string;
    text?: string;
    href?: string;
    type?: string;
    placeholder?: string;
    role?: string;
    value?: string;
    ariaLabel?: string;
  }>;
  visibleText: string;
}

/**
 * Format page content as plain text (polymathic consensus: Einstein + Feynman).
 * No markdown headers, no arrows, no brackets on content — telegram style.
 * Strips nav/footer boilerplate, caps at maxChars of main content.
 * Appends a one-line action hint (~15 tokens) so the model knows what's available.
 */
function formatPlainTextPage(raw: PageData, maxChars: number = 1500): string {
  const lines: string[] = [];
  lines.push(`Title: ${raw.title}`);
  lines.push(`URL: ${raw.url}`);
  lines.push('');

  // Main content — strip leading/trailing whitespace, cap length
  const text = raw.visibleText?.substring(0, maxChars).trim() || '(empty page)';
  lines.push(text);

  // Action hint (Feynman: ~15 tokens, replaces protocol memory requirement)
  const elCount = raw.elements?.length ?? 0;
  if (elCount > 0) {
    const hasForm = raw.elements.some(
      (e) => e.tag === 'input' || e.tag === 'textarea' || e.tag === 'select',
    );
    if (hasForm) {
      lines.push('', `[Page has ${elCount} interactive elements including form inputs. Call browser_elements() to see them.]`);
    } else {
      lines.push('', `[Page has ${elCount} interactive elements. Call browser_elements() to interact.]`);
    }
  }

  return lines.join('\n');
}

/**
 * Format interactive elements as plain text list (polymathic consensus).
 * Top N elements only (Feynman: cap at 5-10 for near-perfect selection accuracy).
 * Uses ARIA landmark hints (Einstein: nav/main/aside/footer hierarchy).
 */
function formatElementsList(
  elements: PageData['elements'],
  maxElements: number = 10,
): string {
  if (!elements || elements.length === 0) {
    return 'No interactive elements found on this page.';
  }

  const top = elements.slice(0, maxElements);
  const lines: string[] = [];

  for (const el of top) {
    const label = el.text || el.ariaLabel || el.placeholder || el.value || '';
    const short = label.substring(0, 60).replace(/\n/g, ' ').trim();

    if (el.tag === 'a' && el.href) {
      lines.push(`${el.index}: link "${short}" ${el.href}`);
    } else if (el.tag === 'input') {
      lines.push(`${el.index}: input(${el.type || 'text'}) ${short || el.placeholder || ''}`);
    } else if (el.tag === 'button' || el.role === 'button') {
      lines.push(`${el.index}: button "${short}"`);
    } else if (el.tag === 'select') {
      lines.push(`${el.index}: dropdown "${short}"`);
    } else if (el.tag === 'textarea') {
      lines.push(`${el.index}: textarea "${short}"`);
    } else {
      lines.push(`${el.index}: ${el.tag} "${short}"`);
    }
  }

  if (elements.length > maxElements) {
    lines.push(`(${elements.length - maxElements} more elements not shown)`);
  }

  return lines.join('\n');
}

// ── write_file tool ───────────────────────────────────────────────────────────

toolRegistry.register({
  category: 'code',
  schema: {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write content to a file in the current output directory. Use this to create HTML, CSS, JS, and other web files. Always start with index.html as your main entry point.',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'File name only, no path (e.g. index.html, styles.css, app.js). Subdirectories not allowed.',
          },
          content: {
            type: 'string',
            description: 'Full file content to write.',
          },
        },
        required: ['filename', 'content'],
      },
    },
  },
  executor: async (args) => {
    const filename = args.filename as string;
    const content = args.content as string;

    if (!filename || typeof filename !== 'string') {
      return 'Error: filename is required';
    }

    // Security: no path traversal, no directory separators
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return 'Error: filename must be a plain filename with no path components (e.g. index.html)';
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return `Error: file extension "${ext}" is not allowed. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`;
    }

    const outputDir = getActiveOutputDir();
    if (!outputDir) {
      return 'Error: no output directory configured. write_file is only available during Arena battles.';
    }

    try {
      mkdirSync(outputDir, { recursive: true });
      const filePath = path.join(outputDir, filename);
      writeFileSync(filePath, content, 'utf8');
      return `File written: ${filePath} (${content.length} bytes)`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error writing file: ${msg}`;
    }
  },
});

// ── Browser tool registrations ────────────────────────────────────────────────

// ── Tier 1: Core browser tools (available to ALL models including sub-2B) ─────

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_go',
      description:
        'Navigate to a URL and read its content in one step. Returns the page title, URL, and text content. This is the primary tool for reading any website.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Full URL to navigate to (https://...)',
          },
        },
        required: ['url'],
      },
    },
  },
  executor: async (args) => {
    const url = args.url as string;
    const sessionId = requireBrowserSession();
    await navigateTo(sessionId, url);
    const raw = (await readPage(sessionId)) as PageData;
    return formatPlainTextPage(raw);
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_elements',
      description:
        'List the interactive elements on the current page (links, buttons, inputs). Use after browser_go to see what you can click or type into. Returns element indices for use with browser_click or browser_type.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  executor: async () => {
    const sessionId = requireBrowserSession();
    const raw = (await readPage(sessionId)) as PageData;
    const list = formatElementsList(raw.elements);
    return `Interactive elements on "${raw.title}":\n\n${list}\n\nUse browser_click(index) or browser_type(text, index) to interact.`;
  },
});

// browser_navigate and browser_read_page REMOVED — replaced by browser_go.
// Having both confused models into picking the old two-step workflow.
// One canonical path: browser_go → browser_elements → browser_click/type.

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_click',
      description:
        'Click an element by its index number from browser_elements.',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'Element index from browser_elements',
          },
        },
        required: ['index'],
      },
    },
  },
  executor: async (args) => {
    const sessionId = requireBrowserSession();
    const result = await clickElement(sessionId, args.index as number);
    return JSON.stringify(result ?? 'clicked');
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_type',
      description:
        'Type text into a focused input on the current browser page. Optionally specify an element index to focus first.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to type',
          },
          index: {
            type: 'number',
            description: 'Optional element index to focus before typing',
          },
        },
        required: ['text'],
      },
    },
  },
  executor: async (args) => {
    const sessionId = requireBrowserSession();
    const result = await typeText(sessionId, args.text as string, args.index as number | undefined);
    return JSON.stringify(result ?? 'typed');
  },
});

// browser_screenshot, browser_execute_js, browser_scroll, browser_console_logs REMOVED.
// These confused models (especially Gemma) into dumping HTML via execute_js or looping on scroll.
// The core 4 browser tools (go, elements, click, type) cover all benchmark use cases.
// These functions remain available in browser-manager.ts for direct IPC use by the UI.
