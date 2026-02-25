const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Endpoints ──
export const api = {
  endpoints: {
    list: () => request<import('./types').Endpoint[]>('/endpoints'),
    create: (data: { name: string; base_url: string; api_key?: string }) =>
      request<import('./types').Endpoint>('/endpoints', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Record<string, unknown>) =>
      request<import('./types').Endpoint>(`/endpoints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/endpoints/${id}`, { method: 'DELETE' }),
    models: (id: number) => request<{ models: import('./types').ModelInfo[] }>(`/endpoints/${id}/models`),
  },

  suites: {
    list: () => request<import('./types').TestSuite[]>('/suites'),
    create: (data: { name: string; description?: string }) =>
      request<import('./types').TestSuite>('/suites', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/suites/${id}`, { method: 'DELETE' }),
    seedDefaults: () => request<{ message: string; suite_id: number }>('/suites/seed-defaults', { method: 'POST' }),
    addCase: (suiteId: number, data: Record<string, unknown>) =>
      request<import('./types').TestCase>(`/suites/${suiteId}/cases`, { method: 'POST', body: JSON.stringify(data) }),
    updateCase: (suiteId: number, caseId: number, data: Record<string, unknown>) =>
      request<import('./types').TestCase>(`/suites/${suiteId}/cases/${caseId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCase: (suiteId: number, caseId: number) =>
      request<void>(`/suites/${suiteId}/cases/${caseId}`, { method: 'DELETE' }),
  },

  benchmarks: {
    run: (data: { endpoint_id: number; suite_id: number; model_id: string; model_name: string; is_thinking?: boolean }) =>
      request<{ run_id: number; status: string }>('/benchmarks/run', { method: 'POST', body: JSON.stringify(data) }),
    cancel: (runId: number) => request<{ message: string }>(`/benchmarks/cancel/${runId}`, { method: 'POST' }),
    list: () => request<import('./types').BenchmarkRun[]>('/benchmarks/runs'),
    get: (runId: number) => request<import('./types').BenchmarkRun>(`/benchmarks/runs/${runId}`),
    delete: (runId: number) => request<void>(`/benchmarks/runs/${runId}`, { method: 'DELETE' }),
    compare: (runIds: number[]) => request<{ runs: import('./types').BenchmarkRun[] }>(`/compare?run_ids=${runIds.join(',')}`),
    exportUrl: (runId: number, format: string) => `${BASE}/export/runs/${runId}?format=${format}`,
    import: (filePath: string) =>
      request<{ imported: { run_id: number; model: string; tests: number }[] }>('/benchmarks/import', {
        method: 'POST', body: JSON.stringify({ file_path: filePath }),
      }),
  },
};
