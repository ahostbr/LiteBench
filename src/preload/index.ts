import { contextBridge, ipcRenderer } from 'electron';
import type {
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
  TestCase,
  TestCaseCreateInput,
  TestCaseUpdateInput,
  TestSuite,
  TestSuiteCreateInput,
} from '../shared/types';

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
};

contextBridge.exposeInMainWorld('liteBench', api);
