import { create } from 'zustand';
import type { BenchmarkRun } from '@/api/types';
import { api } from '@/api/client';

interface ResultsState {
  runs: BenchmarkRun[];
  loading: boolean;
  fetch: () => Promise<void>;
  getRun: (id: number) => Promise<BenchmarkRun>;
  deleteRun: (id: number) => Promise<void>;
  compare: (ids: number[]) => Promise<BenchmarkRun[]>;
  importLegacy: (filePath: string) => Promise<void>;
}

export const useResultsStore = create<ResultsState>((set, get) => ({
  runs: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const runs = await api.benchmarks.list();
    set({ runs, loading: false });
  },

  getRun: async (id) => {
    return api.benchmarks.get(id);
  },

  deleteRun: async (id) => {
    await api.benchmarks.delete(id);
    set((s) => ({ runs: s.runs.filter((r) => r.id !== id) }));
  },

  compare: async (ids) => {
    const { runs } = await api.benchmarks.compare(ids);
    return runs;
  },

  importLegacy: async (filePath) => {
    await api.benchmarks.import(filePath);
    await get().fetch();
  },
}));
