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
    seedCreator: () => window.liteBench.suites.seedCreator(),
    seedAgent: () => window.liteBench.suites.seedAgent(),
    addCase: (suiteId: number, data: Record<string, unknown>) =>
      window.liteBench.suites.addCase(suiteId, data as any),
    updateCase: (suiteId: number, caseId: number, data: Record<string, unknown>) =>
      window.liteBench.suites.updateCase(suiteId, caseId, data as any),
    deleteCase: (suiteId: number, caseId: number) =>
      window.liteBench.suites.deleteCase(suiteId, caseId),
  },

  benchmarks: {
    run: (data: { endpoint_id: number; suite_id: number; model_id: string; model_name: string; is_thinking?: boolean; is_agent_run?: boolean }) =>
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

  agent: {
    send: (request: Parameters<typeof window.liteBench.agent.send>[0]) =>
      window.liteBench.agent.send(request),
    cancel: (conversationId: string) =>
      window.liteBench.agent.cancel(conversationId),
    getHistory: (conversationId: string) =>
      window.liteBench.agent.getHistory(conversationId),
    checkSetup: () => window.liteBench.agent.checkSetup(),
    onStreamEvent: (
      conversationId: string,
      callback: Parameters<typeof window.liteBench.agent.onStreamEvent>[1],
    ) => window.liteBench.agent.onStreamEvent(conversationId, callback),
  },

  agentBenchmark: {
    run: (data: { endpoint_id: number; suite_id: number; model_id: string; model_name: string }) =>
      window.liteBench.agentBenchmark.run(data),
    cancel: (runId: number) => window.liteBench.agentBenchmark.cancel(runId),
    onEvent: (callback: Parameters<typeof window.liteBench.agentBenchmark.onEvent>[0]) =>
      window.liteBench.agentBenchmark.onEvent(callback),
  },

  browser: {
    create: () => window.liteBench.browser.create(),
    destroy: (sessionId: string) => window.liteBench.browser.destroy(sessionId),
    navigate: (sessionId: string, url: string) => window.liteBench.browser.navigate(sessionId, url),
    back: (sessionId: string) => window.liteBench.browser.back(sessionId),
    forward: (sessionId: string) => window.liteBench.browser.forward(sessionId),
    reload: (sessionId: string) => window.liteBench.browser.reload(sessionId),
    setBounds: (sessionId: string, bounds: Parameters<typeof window.liteBench.browser.setBounds>[1]) =>
      window.liteBench.browser.setBounds(sessionId, bounds),
    show: (sessionId: string) => window.liteBench.browser.show(sessionId),
    hide: (sessionId: string) => window.liteBench.browser.hide(sessionId),
    executeJS: (sessionId: string, code: string) => window.liteBench.browser.executeJS(sessionId, code),
    screenshot: (sessionId: string) => window.liteBench.browser.screenshot(sessionId),
    readPage: (sessionId: string) => window.liteBench.browser.readPage(sessionId),
    click: (sessionId: string, index: number) => window.liteBench.browser.click(sessionId, index),
    type: (sessionId: string, text: string, index?: number) => window.liteBench.browser.type(sessionId, text, index),
    scroll: (sessionId: string, direction: 'up' | 'down' | 'left' | 'right', amount: number) =>
      window.liteBench.browser.scroll(sessionId, direction, amount),
    select: (sessionId: string, elementIndex: number, optionIndex: number) =>
      window.liteBench.browser.select(sessionId, elementIndex, optionIndex),
    consoleLogs: (sessionId: string) => window.liteBench.browser.consoleLogs(sessionId),
    getUrl: (sessionId: string) => window.liteBench.browser.getUrl(sessionId),
  },
};
