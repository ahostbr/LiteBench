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
  /** Whether this tool requires a feature flag / armed state to be usable */
  requiresArmed?: boolean;
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

  /** All schemas as an array — passed directly to OpenAI chat.completions.create.
   *  Filters out tools that require arming (e.g. pccontrol) unless they are armed.
   */
  getSchemas(): OpenAI.Chat.ChatCompletionTool[] {
    return Array.from(this.tools.values())
      .filter((r) => !r.requiresArmed || this.isArmed(r))
      .map((r) => r.schema);
  }

  /** Check if an armed tool is currently authorized */
  private isArmed(reg: ToolRegistration): boolean {
    if (!reg.requiresArmed) return true;
    // For pccontrol: check the armed flag file
    const name = reg.schema.function.name;
    if (name === 'pccontrol') {
      const fs = require('fs');
      const path = require('path');
      const flagPath = path.join(process.cwd(), 'mcp-server', 'config', 'pccontrol-armed.flag');
      try { return fs.existsSync(flagPath); } catch { return false; }
    }
    return false;
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
  module: 'web_search',
  handler: 'handle_web_search',
  schema: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web using DuckDuckGo. Use for current events, facts, or any information that may not be in training data.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['search', 'news'],
            description: 'search for general results, news for recent news articles',
          },
          query: {
            type: 'string',
            description: 'Search query string',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 10)',
          },
        },
        required: ['action', 'query'],
      },
    },
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

if (process.platform === 'win32') toolRegistry.register({
  category: 'desktop',
  module: 'pccontrol',
  handler: 'handle_pccontrol',
  requiresArmed: true,
  schema: {
    type: 'function',
    function: {
      name: 'pccontrol',
      description:
        'Control the Windows desktop via PowerShell/Win32 APIs. DANGER: Has full control of the PC when the armed flag is set. Actions: help, status, click, doubleclick, rightclick, type, keypress, launch_app, get_windows. Windows-only.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'help',
              'status',
              'click',
              'doubleclick',
              'rightclick',
              'type',
              'keypress',
              'launch_app',
              'get_windows',
            ],
            description: 'Action to perform',
          },
          x: {
            type: 'number',
            description: 'X coordinate for click actions',
          },
          y: {
            type: 'number',
            description: 'Y coordinate for click actions',
          },
          text: {
            type: 'string',
            description: 'Text to type (for type action)',
          },
          key: {
            type: 'string',
            description:
              'Key to press (for keypress action): Enter, Tab, Escape, Backspace, Delete, Up, Down, Left, Right, F1-F12, ctrl+c, alt+tab, etc.',
          },
          path: {
            type: 'string',
            description: 'Application path or name (for launch_app action)',
          },
        },
        required: ['action'],
      },
    },
  },
});

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
    navigateTo(sessionId, url);
    return `Navigated to ${url}`;
  },
});

toolRegistry.register({
  category: 'browser',
  schema: {
    type: 'function',
    function: {
      name: 'browser_read_page',
      description:
        'Read the current browser page — returns a structured list of interactive elements (links, buttons, inputs) with their indices. Use this to understand the page before clicking or typing.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  executor: async () => {
    const sessionId = requireBrowserSession();
    const result = await readPage(sessionId);
    return JSON.stringify(result);
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
