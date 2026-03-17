export const api = {
  endpoints: {
    list: () => window.liteBench.endpoints.list(),
    create: (data: { name: string; base_url: string; api_key?: string }) =>
      window.liteBench.endpoints.create(data),
    update: (id: number, data: Record<string, unknown>) =>
      window.liteBench.endpoints.update(id, data),
    delete: (id: number) => window.liteBench.endpoints.delete(id),
    models: (id: number) => window.liteBench.endpoints.models(id),
  },

  suites: {
    list: () => window.liteBench.suites.list(),
    create: (data: { name: string; description?: string }) =>
      window.liteBench.suites.create(data),
    delete: (id: number) => window.liteBench.suites.delete(id),
    seedDefaults: () => window.liteBench.suites.seedDefaults(),
    seedStandard: () => window.liteBench.suites.seedStandard(),
    seedStress: () => window.liteBench.suites.seedStress(),
    seedSpeed: () => window.liteBench.suites.seedSpeed(),
    seedJudgment: () => window.liteBench.suites.seedJudgment(),
    addCase: (suiteId: number, data: Record<string, unknown>) =>
      window.liteBench.suites.addCase(suiteId, data as any),
    updateCase: (suiteId: number, caseId: number, data: Record<string, unknown>) =>
      window.liteBench.suites.updateCase(suiteId, caseId, data as any),
    deleteCase: (suiteId: number, caseId: number) =>
      window.liteBench.suites.deleteCase(suiteId, caseId),
  },

  benchmarks: {
    run: (data: { endpoint_id: number; suite_id: number; model_id: string; model_name: string; is_thinking?: boolean }) =>
      window.liteBench.benchmarks.run(data),
    cancel: (runId: number) => window.liteBench.benchmarks.cancel(runId),
    list: () => window.liteBench.benchmarks.list(),
    get: (runId: number) => window.liteBench.benchmarks.get(runId),
    delete: (runId: number) => window.liteBench.benchmarks.delete(runId),
    compare: (runIds: number[]) => window.liteBench.benchmarks.compare(runIds),
    export: (runId: number, format: 'json' | 'csv' | 'md') =>
      window.liteBench.benchmarks.export(runId, format),
    pickImportFile: () => window.liteBench.benchmarks.pickImportFile(),
    import: (filePath: string) => window.liteBench.benchmarks.import(filePath),
  },

  stream: {
    onRunEvent: (callback: Parameters<typeof window.liteBench.stream.onRunEvent>[0]) =>
      window.liteBench.stream.onRunEvent(callback),
  },
};
