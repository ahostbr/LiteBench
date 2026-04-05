import { create } from 'zustand';
import type { TestSuite } from '@/api/types';
import { api } from '@/api/client';

interface TestsState {
  suites: TestSuite[];
  loading: boolean;
  fetch: () => Promise<void>;
  seedDefaults: () => Promise<void>;
  seedAgent: () => Promise<void>;
  seedCreator: () => Promise<void>;
  createSuite: (name: string, description?: string) => Promise<TestSuite>;
  deleteSuite: (id: number) => Promise<void>;
  addCase: (suiteId: number, data: Record<string, unknown>) => Promise<void>;
  updateCase: (suiteId: number, caseId: number, data: Record<string, unknown>) => Promise<void>;
  deleteCase: (suiteId: number, caseId: number) => Promise<void>;
}

export const useTestsStore = create<TestsState>((set, get) => ({
  suites: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const suites = await api.suites.list();
    set({ suites, loading: false });
  },

  seedDefaults: async () => {
    await api.suites.seedDefaults();
    await get().fetch();
  },

  seedAgent: async () => {
    await api.suites.seedAgent();
    await get().fetch();
  },

  seedCreator: async () => {
    await api.suites.seedCreator();
    await get().fetch();
  },

  createSuite: async (name, description) => {
    const suite = await api.suites.create({ name, description });
    await get().fetch();
    return suite;
  },

  deleteSuite: async (id) => {
    await api.suites.delete(id);
    set((s) => ({ suites: s.suites.filter((x) => x.id !== id) }));
  },

  addCase: async (suiteId, data) => {
    await api.suites.addCase(suiteId, data);
    await get().fetch();
  },

  updateCase: async (suiteId, caseId, data) => {
    await api.suites.updateCase(suiteId, caseId, data);
    await get().fetch();
  },

  deleteCase: async (suiteId, caseId) => {
    await api.suites.deleteCase(suiteId, caseId);
    await get().fetch();
  },
}));
