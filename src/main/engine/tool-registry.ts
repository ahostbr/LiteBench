import OpenAI from 'openai';
import {
  navigateTo,
  readPage,
  clickElement,
  typeText,
  screenshot,
  executeJS,
  scrollPage,
  getConsoleLogs,
  getActiveSessionId,
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

// ── Browser tool registrations ────────────────────────────────────────────────

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description:
        'Open a URL in the embedded browser. Creates a browser session if one does not exist. Use before any other browser tools.',
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
    const result = await navigateTo(sessionId, url);
    return `Page loaded: "${result.title}" at ${result.url}`;
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_read_page',
      description:
        'Read the current browser page — returns the page title, visible text content, and a list of clickable elements with [index] numbers. Use after browser_navigate to read page content.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  executor: async () => {
    const sessionId = requireBrowserSession();
    const raw = (await readPage(sessionId)) as {
      url: string;
      title: string;
      elements: Array<{ index: number; tag: string; text?: string; href?: string; type?: string; placeholder?: string; role?: string; value?: string; ariaLabel?: string }>;
      visibleText: string;
    };

    // Format as clean text that local models can easily parse
    const lines: string[] = [];
    lines.push(`# ${raw.title}`);
    lines.push(`URL: ${raw.url}`);
    lines.push('');

    // Page text (truncated for model context)
    const text = raw.visibleText.substring(0, 3000).trim();
    if (text) {
      lines.push('## Page Content');
      lines.push(text);
      lines.push('');
    }

    // Interactive elements — simplified, no bounds
    if (raw.elements.length > 0) {
      lines.push('## Interactive Elements');
      for (const el of raw.elements.slice(0, 50)) {
        const label = el.text || el.ariaLabel || el.placeholder || el.value || '';
        const short = label.substring(0, 80).replace(/\n/g, ' ').trim();
        if (el.tag === 'a' && el.href) {
          lines.push(`[${el.index}] link: "${short}" → ${el.href}`);
        } else if (el.tag === 'input') {
          lines.push(`[${el.index}] input(${el.type || 'text'}): ${short || el.placeholder || ''}`);
        } else if (el.tag === 'button' || el.role === 'button') {
          lines.push(`[${el.index}] button: "${short}"`);
        } else {
          lines.push(`[${el.index}] ${el.tag}: "${short}"`);
        }
      }
      if (raw.elements.length > 50) {
        lines.push(`... and ${raw.elements.length - 50} more elements (scroll to see more)`);
      }
    }

    return lines.join('\n');
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_click',
      description:
        'Click an element on the current browser page by its index from browser_read_page.',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'Element index from browser_read_page output',
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

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description:
        'Capture a screenshot of the current browser page. Returns a base64-encoded PNG.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  executor: async () => {
    const sessionId = requireBrowserSession();
    const base64 = await screenshot(sessionId);
    return `data:image/png;base64,${base64}`;
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_execute_js',
      description:
        'Execute arbitrary JavaScript in the current browser page and return the result. Use with caution — runs in page context.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript expression or statement to execute',
          },
        },
        required: ['code'],
      },
    },
  },
  executor: async (args) => {
    const sessionId = requireBrowserSession();
    const result = await executeJS(sessionId, args.code as string);
    return JSON.stringify(result);
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_scroll',
      description: 'Scroll the current browser page in a direction.',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Scroll direction',
          },
          amount: {
            type: 'number',
            description: 'Pixels to scroll (default: 300)',
          },
        },
        required: ['direction'],
      },
    },
  },
  executor: async (args) => {
    const sessionId = requireBrowserSession();
    await scrollPage(
      sessionId,
      args.direction as 'up' | 'down' | 'left' | 'right',
      (args.amount as number) ?? 300,
    );
    return `Scrolled ${args.direction} by ${(args.amount as number) ?? 300}px`;
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_console_logs',
      description:
        'Get recent console.log/warn/error messages from the current browser page. Useful for debugging page behavior.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  executor: async () => {
    const sessionId = requireBrowserSession();
    const logs = getConsoleLogs(sessionId);
    return logs.length > 0 ? logs.join('\n') : '(no console output)';
  },
});
