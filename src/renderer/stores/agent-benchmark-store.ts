import { create } from 'zustand';
import type {
  AgentToolCall,
  CompletedAgentTask,
  LiveAgentTask,
  AgentBenchmarkSummary,
} from '../../shared/types';

interface AgentBenchmarkState {
  runId: number | null;
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  suiteName: string | null;
  modelName: string | null;
  totalTasks: number;
  completedTasks: number;
  currentTask: LiveAgentTask | null;
  results: CompletedAgentTask[];
  summary: AgentBenchmarkSummary | null;

  startRun: (runId: number, suiteName: string, modelName: string, totalTasks: number) => void;
  setCurrentTask: (task: Omit<LiveAgentTask, 'textSoFar' | 'toolCalls'>) => void;
  appendTextDelta: (content: string) => void;
  addToolCall: (toolCall: AgentToolCall) => void;
  updateToolCall: (toolCallId: string, update: Partial<AgentToolCall>) => void;
  addResult: (result: CompletedAgentTask) => void;
  setSummary: (summary: AgentBenchmarkSummary) => void;
  finish: (status: 'done' | 'error' | 'cancelled') => void;
  reset: () => void;
}

export const useAgentBenchmarkStore = create<AgentBenchmarkState>((set) => ({
  runId: null,
  status: 'idle',
  suiteName: null,
  modelName: null,
  totalTasks: 0,
  completedTasks: 0,
  currentTask: null,
  results: [],
  summary: null,

  startRun: (runId, suiteName, modelName, totalTasks) =>
    set({
      runId,
      status: 'running',
      suiteName,
      modelName,
      totalTasks,
      completedTasks: 0,
      currentTask: null,
      results: [],
      summary: null,
    }),

  setCurrentTask: (task) =>
    set({
      currentTask: { ...task, textSoFar: '', toolCalls: [] },
    }),

  appendTextDelta: (content) =>
    set((s) => {
      if (!s.currentTask) return s;
      return {
        currentTask: {
          ...s.currentTask,
          textSoFar: s.currentTask.textSoFar + content,
        },
      };
    }),

  addToolCall: (toolCall) =>
    set((s) => {
      if (!s.currentTask) return s;
      return {
        currentTask: {
          ...s.currentTask,
          toolCalls: [...s.currentTask.toolCalls, toolCall],
        },
      };
    }),

  updateToolCall: (toolCallId, update) =>
    set((s) => {
      if (!s.currentTask) return s;
      return {
        currentTask: {
          ...s.currentTask,
          toolCalls: s.currentTask.toolCalls.map((tc) =>
            tc.id === toolCallId ? { ...tc, ...update } : tc,
          ),
        },
      };
    }),

  addResult: (result) =>
    set((s) => ({
      results: [...s.results, result],
      completedTasks: s.completedTasks + 1,
      currentTask: null,
    })),

  setSummary: (summary) => set({ summary }),

  finish: (status) => set({ status, currentTask: null }),

  reset: () =>
    set({
      runId: null,
      status: 'idle',
      suiteName: null,
      modelName: null,
      totalTasks: 0,
      completedTasks: 0,
      currentTask: null,
      results: [],
      summary: null,
    }),
}));
