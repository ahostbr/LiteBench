import { create } from 'zustand';
import type { SSETestDone, SSESummary } from '@/api/types';

interface BenchmarkState {
  runId: number | null;
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  totalTests: number;
  completedTests: number;
  currentTest: string | null;
  results: SSETestDone[];
  summary: SSESummary | null;

  startRun: (runId: number, totalTests: number) => void;
  setCurrentTest: (name: string) => void;
  addResult: (result: SSETestDone) => void;
  setSummary: (summary: SSESummary) => void;
  finish: (status: 'done' | 'error' | 'cancelled') => void;
  reset: () => void;
}

export const useBenchmarkStore = create<BenchmarkState>((set) => ({
  runId: null,
  status: 'idle',
  totalTests: 0,
  completedTests: 0,
  currentTest: null,
  results: [],
  summary: null,

  startRun: (runId, totalTests) =>
    set({
      runId,
      status: 'running',
      totalTests,
      completedTests: 0,
      currentTest: null,
      results: [],
      summary: null,
    }),

  setCurrentTest: (name) => set({ currentTest: name }),

  addResult: (result) =>
    set((s) => ({
      results: [...s.results, result],
      completedTests: s.completedTests + 1,
      currentTest: null,
    })),

  setSummary: (summary) => set({ summary }),

  finish: (status) => set({ status, currentTest: null }),

  reset: () =>
    set({
      runId: null,
      status: 'idle',
      totalTests: 0,
      completedTests: 0,
      currentTest: null,
      results: [],
      summary: null,
    }),
}));
