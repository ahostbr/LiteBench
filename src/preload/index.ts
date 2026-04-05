import { contextBridge, ipcRenderer } from 'electron';
import * as fs from 'fs'
import * as path from 'path'

let themeManifest: Record<string, unknown> | null = null
try {
  const manifestPaths = [
    path.join(process.resourcesPath || '', '..', '..', 'theme-manifest.json'),
    path.join(process.resourcesPath || '', '..', '..', 'LiteCore', 'resources', 'theme-manifest.json'),
    path.resolve(__dirname, '..', '..', '..', 'LiteCore', 'resources', 'theme-manifest.json'),
  ]
  for (const p of manifestPaths) {
    if (fs.existsSync(p)) {
      themeManifest = JSON.parse(fs.readFileSync(p, 'utf-8'))
      break
    }
  }
} catch {}
import type {
  AgentBenchmarkStreamEvent,
  AgentChatMessage,
  AgentSendRequest,
  AgentStreamEvent,
  ApiMessageResponse,
  BenchmarkRun,
  BenchmarkRunRequest,
  BenchmarkRunStartResponse,
  BenchmarkStreamEvent,
  CompareRunsResponse,
  Endpoint,
  EndpointCreateInput,
  EndpointUpdateInput,
  ExportFormat,
  ExportRunResponse,
  ImportLegacyResponse,
  ModelInfo,
  SeedSuiteResponse,
  SetupCheckResult,
  TestCase,
  TestCaseCreateInput,
  TestCaseUpdateInput,
  TestSuite,
  TestSuiteCreateInput,
} from '../shared/types';

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LiteBenchApi {
  endpoints: {
    list(): Promise<Endpoint[]>;
    create(input: EndpointCreateInput): Promise<Endpoint>;
    update(id: number, input: EndpointUpdateInput): Promise<Endpoint>;
    delete(id: number): Promise<void>;
    models(id: number): Promise<{ models: ModelInfo[] }>;
  };
  suites: {
    list(): Promise<TestSuite[]>;
    create(input: TestSuiteCreateInput): Promise<TestSuite>;
    delete(id: number): Promise<void>;
    seedDefaults(): Promise<SeedSuiteResponse>;
    seedStandard(): Promise<SeedSuiteResponse>;
    seedStress(): Promise<SeedSuiteResponse>;
    seedSpeed(): Promise<SeedSuiteResponse>;
    seedJudgment(): Promise<SeedSuiteResponse>;
    seedCreator(): Promise<SeedSuiteResponse>;
    seedAgent(): Promise<SeedSuiteResponse>;
    addCase(suiteId: number, input: TestCaseCreateInput): Promise<TestCase>;
    updateCase(
      suiteId: number,
      caseId: number,
      input: TestCaseUpdateInput,
    ): Promise<TestCase>;
    deleteCase(suiteId: number, caseId: number): Promise<void>;
  };
  benchmarks: {
    run(input: BenchmarkRunRequest): Promise<BenchmarkRunStartResponse>;
    cancel(runId: number): Promise<ApiMessageResponse>;
    list(): Promise<BenchmarkRun[]>;
    get(runId: number): Promise<BenchmarkRun>;
    delete(runId: number): Promise<void>;
    compare(runIds: number[]): Promise<CompareRunsResponse>;
    export(runId: number, format: ExportFormat): Promise<ExportRunResponse>;
    pickImportFile(): Promise<string | null>;
    import(filePath: string): Promise<ImportLegacyResponse>;
  };
  stream: {
    onRunEvent(callback: (event: BenchmarkStreamEvent) => void): () => void;
  };
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(callback: (maximized: boolean) => void): () => void;
    spanAllMonitors(): void;
    restoreSpan(): void;
    isSpanned(): Promise<boolean>;
    displayCount(): Promise<number>;
    onSpanChange(callback: (spanned: boolean) => void): () => void;
    getZoom(): Promise<number>;
    setZoom(pct: number): Promise<void>;
    onZoomChange(callback: (pct: number) => void): () => void;
  };
  agent: {
    send(request: AgentSendRequest): Promise<{ conversationId: string }>;
    cancel(conversationId: string): Promise<void>;
    getHistory(conversationId: string): Promise<AgentChatMessage[]>;
    checkSetup(): Promise<SetupCheckResult[]>;
    installDep(name: string): Promise<boolean>;
    onStreamEvent(
      conversationId: string,
      callback: (event: AgentStreamEvent) => void,
    ): () => void;
  };
  agentBenchmark: {
    run(input: { endpoint_id: number; suite_id: number; model_id: string; model_name: string }): Promise<BenchmarkRunStartResponse>;
    cancel(runId: number): Promise<ApiMessageResponse>;
    onEvent(callback: (event: AgentBenchmarkStreamEvent) => void): () => void;
  };
  browser: {
    create(): Promise<string>;
    destroy(sessionId: string): Promise<void>;
    navigate(sessionId: string, url: string): Promise<void>;
    back(sessionId: string): Promise<void>;
    forward(sessionId: string): Promise<void>;
    reload(sessionId: string): Promise<void>;
    setBounds(sessionId: string, bounds: BrowserBounds): Promise<void>;
    show(sessionId: string): Promise<void>;
    hide(sessionId: string): Promise<void>;
    executeJS(sessionId: string, code: string): Promise<unknown>;
    screenshot(sessionId: string): Promise<string>;
    readPage(sessionId: string): Promise<unknown>;
    click(sessionId: string, index: number): Promise<unknown>;
    type(sessionId: string, text: string, index?: number): Promise<unknown>;
    scroll(sessionId: string, direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<unknown>;
    select(sessionId: string, elementIndex: number, optionIndex: number): Promise<unknown>;
    consoleLogs(sessionId: string): Promise<string[]>;
    getUrl(sessionId: string): Promise<string>;
  };
}

const api: LiteBenchApi = {
  endpoints: {
    list: () => ipcRenderer.invoke('bench:endpoints:list'),
    create: (input) => ipcRenderer.invoke('bench:endpoints:create', input),
    update: (id, input) =>
      ipcRenderer.invoke('bench:endpoints:update', id, input),
    delete: (id) => ipcRenderer.invoke('bench:endpoints:delete', id),
    models: (id) => ipcRenderer.invoke('bench:endpoints:models', id),
  },
  suites: {
    list: () => ipcRenderer.invoke('bench:suites:list'),
    create: (input) => ipcRenderer.invoke('bench:suites:create', input),
    delete: (id) => ipcRenderer.invoke('bench:suites:delete', id),
    seedDefaults: () => ipcRenderer.invoke('bench:suites:seed-defaults'),
    seedStandard: () => ipcRenderer.invoke('bench:suites:seed-standard'),
    seedStress: () => ipcRenderer.invoke('bench:suites:seed-stress'),
    seedSpeed: () => ipcRenderer.invoke('bench:suites:seed-speed'),
    seedJudgment: () => ipcRenderer.invoke('bench:suites:seed-judgment'),
    seedCreator: () => ipcRenderer.invoke('bench:suites:seed-creator'),
    seedAgent: () => ipcRenderer.invoke('bench:suites:seed-agent'),
    addCase: (suiteId, input) =>
      ipcRenderer.invoke('bench:suites:cases:create', suiteId, input),
    updateCase: (suiteId, caseId, input) =>
      ipcRenderer.invoke('bench:suites:cases:update', suiteId, caseId, input),
    deleteCase: (suiteId, caseId) =>
      ipcRenderer.invoke('bench:suites:cases:delete', suiteId, caseId),
  },
  benchmarks: {
    run: (input) => ipcRenderer.invoke('bench:run:start', input),
    cancel: (runId) => ipcRenderer.invoke('bench:run:cancel', runId),
    list: () => ipcRenderer.invoke('bench:runs:list'),
    get: (runId) => ipcRenderer.invoke('bench:run:get', runId),
    delete: (runId) => ipcRenderer.invoke('bench:run:delete', runId),
    compare: (runIds) => ipcRenderer.invoke('bench:runs:compare', runIds),
    export: (runId, format) =>
      ipcRenderer.invoke('bench:run:export', runId, format),
    pickImportFile: () => ipcRenderer.invoke('bench:run:pick-import'),
    import: (filePath) => ipcRenderer.invoke('bench:run:import', filePath),
  },
  stream: {
    onRunEvent: (callback) => {
      const handler = (_event: unknown, payload: BenchmarkStreamEvent) =>
        callback(payload);
      ipcRenderer.on('bench:run:event', handler);
      return () => {
        ipcRenderer.removeListener('bench:run:event', handler);
      };
    },
  },
  window: {
    minimize: () => ipcRenderer.send('bench:window:minimize'),
    maximize: () => ipcRenderer.send('bench:window:maximize'),
    close: () => ipcRenderer.send('bench:window:close'),
    isMaximized: () => ipcRenderer.invoke('bench:window:is-maximized'),
    onMaximizeChange: (callback) => {
      const handler = (_event: unknown, maximized: boolean) =>
        callback(maximized);
      ipcRenderer.on('bench:window:maximize-change', handler);
      return () => {
        ipcRenderer.removeListener('bench:window:maximize-change', handler);
      };
    },
    spanAllMonitors: () => ipcRenderer.send('bench:window:span-all-monitors'),
    restoreSpan: () => ipcRenderer.send('bench:window:restore-span'),
    isSpanned: () => ipcRenderer.invoke('bench:window:is-spanned'),
    displayCount: () => ipcRenderer.invoke('bench:window:display-count'),
    onSpanChange: (callback) => {
      const handler = (_event: unknown, spanned: boolean) =>
        callback(spanned);
      ipcRenderer.on('bench:window:span-change', handler);
      return () => {
        ipcRenderer.removeListener('bench:window:span-change', handler);
      };
    },
    getZoom: () => ipcRenderer.invoke('bench:window:get-zoom'),
    setZoom: (pct) => ipcRenderer.invoke('bench:window:set-zoom', { zoom: pct }),
    onZoomChange: (callback) => {
      const handler = (_event: unknown, pct: number) => callback(pct);
      ipcRenderer.on('bench:window:zoom-change', handler);
      return () => {
        ipcRenderer.removeListener('bench:window:zoom-change', handler);
      };
    },
  },
  agent: {
    send: (request) => ipcRenderer.invoke('bench:agent:send', request),
    cancel: (conversationId) =>
      ipcRenderer.invoke('bench:agent:cancel', conversationId),
    getHistory: (conversationId) =>
      ipcRenderer.invoke('bench:agent:history', conversationId),
    checkSetup: () => ipcRenderer.invoke('bench:agent:check-setup'),
    installDep: (name) => ipcRenderer.invoke('bench:agent:install-dep', name),
    onStreamEvent: (conversationId, callback) => {
      const channel = `bench:agent:stream:${conversationId}`;
      const handler = (_event: unknown, payload: AgentStreamEvent) =>
        callback(payload);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
  },
  agentBenchmark: {
    run: (input) => ipcRenderer.invoke('bench:agent-bench:run', input),
    cancel: (runId) => ipcRenderer.invoke('bench:agent-bench:cancel', runId),
    onEvent: (callback) => {
      const handler = (_event: unknown, payload: AgentBenchmarkStreamEvent) =>
        callback(payload);
      ipcRenderer.on('bench:agent-bench:event', handler);
      return () => {
        ipcRenderer.removeListener('bench:agent-bench:event', handler);
      };
    },
  },
  browser: {
    create: () => ipcRenderer.invoke('bench:browser:create'),
    destroy: (sessionId) => ipcRenderer.invoke('bench:browser:destroy', sessionId),
    navigate: (sessionId, url) => ipcRenderer.invoke('bench:browser:navigate', sessionId, url),
    back: (sessionId) => ipcRenderer.invoke('bench:browser:back', sessionId),
    forward: (sessionId) => ipcRenderer.invoke('bench:browser:forward', sessionId),
    reload: (sessionId) => ipcRenderer.invoke('bench:browser:reload', sessionId),
    setBounds: (sessionId, bounds) => ipcRenderer.invoke('bench:browser:set-bounds', sessionId, bounds),
    show: (sessionId) => ipcRenderer.invoke('bench:browser:show', sessionId),
    hide: (sessionId) => ipcRenderer.invoke('bench:browser:hide', sessionId),
    executeJS: (sessionId, code) => ipcRenderer.invoke('bench:browser:execute-js', sessionId, code),
    screenshot: (sessionId) => ipcRenderer.invoke('bench:browser:screenshot', sessionId),
    readPage: (sessionId) => ipcRenderer.invoke('bench:browser:read-page', sessionId),
    click: (sessionId, index) => ipcRenderer.invoke('bench:browser:click', sessionId, index),
    type: (sessionId, text, index) => ipcRenderer.invoke('bench:browser:type', sessionId, text, index),
    scroll: (sessionId, direction, amount) => ipcRenderer.invoke('bench:browser:scroll', sessionId, direction, amount),
    select: (sessionId, elementIndex, optionIndex) => ipcRenderer.invoke('bench:browser:select', sessionId, elementIndex, optionIndex),
    consoleLogs: (sessionId) => ipcRenderer.invoke('bench:browser:console-logs', sessionId),
    getUrl: (sessionId) => ipcRenderer.invoke('bench:browser:get-url', sessionId),
  },

  // PTY (terminal)
  pty: {
    create: (opts?: { cwd?: string; cmd?: string; args?: string[] }) =>
      ipcRenderer.invoke('pty:create', opts) as Promise<{ id: string; pid: number }>,
    write: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('pty:resize', id, cols, rows),
    destroy: (id: string) => ipcRenderer.invoke('pty:destroy', id),
    onData: (id: string, cb: (data: string) => void) => {
      const handler = (_: unknown, data: string) => cb(data);
      ipcRenderer.on(`pty:data:${id}`, handler);
      return () => ipcRenderer.removeListener(`pty:data:${id}`, handler);
    },
    onExit: (id: string, cb: (code: number) => void) => {
      const handler = (_: unknown, code: number) => cb(code);
      ipcRenderer.on(`pty:exit:${id}`, handler);
      return () => ipcRenderer.removeListener(`pty:exit:${id}`, handler);
    },
  },

  // Test-only tools (dev/test mode) — exposes tool registry and harness for E2E
  testTools: {
    executeTool: (name: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke('test:tool:execute', name, args),
    getSchemas: (smallModel?: boolean) =>
      ipcRenderer.invoke('test:tool:schemas', smallModel),
    buildPrompt: (modelId: string) =>
      ipcRenderer.invoke('test:harness:prompt', modelId),
    isSmallModel: (modelId: string) =>
      ipcRenderer.invoke('test:harness:is-small', modelId),
  },
};

contextBridge.exposeInMainWorld('liteBench', api);
if (themeManifest) {
  contextBridge.exposeInMainWorld('__themeManifest', themeManifest)
}
