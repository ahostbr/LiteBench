import { create } from 'zustand';
import type { Endpoint, ModelInfo } from '@/api/types';
import { api } from '@/api/client';

interface EndpointsState {
  endpoints: Endpoint[];
  models: Map<number, ModelInfo[]>;
  loading: boolean;
  fetch: () => Promise<void>;
  add: (name: string, baseUrl: string, apiKey?: string) => Promise<Endpoint>;
  remove: (id: number) => Promise<void>;
  discoverModels: (endpointId: number) => Promise<ModelInfo[]>;
}

export const useEndpointsStore = create<EndpointsState>((set, get) => ({
  endpoints: [],
  models: new Map(),
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const endpoints = await api.endpoints.list();
    set({ endpoints, loading: false });
  },

  add: async (name, baseUrl, apiKey) => {
    const ep = await api.endpoints.create({ name, base_url: baseUrl, api_key: apiKey });
    set((s) => ({ endpoints: [ep, ...s.endpoints] }));
    return ep;
  },

  remove: async (id) => {
    await api.endpoints.delete(id);
    set((s) => ({ endpoints: s.endpoints.filter((e) => e.id !== id) }));
  },

  discoverModels: async (endpointId) => {
    const { models: list } = await api.endpoints.models(endpointId);
    set((s) => {
      const m = new Map(s.models);
      m.set(endpointId, list);
      return { models: m };
    });
    return list;
  },
}));
