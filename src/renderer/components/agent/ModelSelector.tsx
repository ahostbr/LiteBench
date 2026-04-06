import { useState, useEffect } from 'react';
import { Server, Bot, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEndpointsStore } from '@/stores/endpoints';
import { useAgentChatStore } from '@/stores/agent-chat-store';

export function ModelSelector() {
  const store = useAgentChatStore();
  const { endpoints, models, fetch: fetchEndpoints, discoverModels } = useEndpointsStore();
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Fetch endpoints on mount
  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  // Auto-select first endpoint if none selected
  useEffect(() => {
    if (!store.selectedEndpointId && endpoints.length > 0) {
      store.setEndpoint(endpoints[0].id);
    }
  }, [endpoints, store.selectedEndpointId]);

  // Reset to first endpoint if current one no longer exists (stale endpoint)
  useEffect(() => {
    if (store.selectedEndpointId && !endpoints.find(e => e.id === store.selectedEndpointId)) {
      if (endpoints.length > 0) store.setEndpoint(endpoints[0].id);
    }
  }, [endpoints, store.selectedEndpointId]);

  // Discover models when endpoint changes
  useEffect(() => {
    if (store.selectedEndpointId) {
      discoverModels(store.selectedEndpointId);
    }
  }, [store.selectedEndpointId, discoverModels]);

  const modelList = store.selectedEndpointId
    ? models.get(store.selectedEndpointId) ?? []
    : [];

  const currentEndpoint = endpoints.find((e) => e.id === store.selectedEndpointId);
  const currentModelLabel = store.selectedModelId
    ? store.selectedModelId.split('/').pop() ?? store.selectedModelId
    : 'Select model';

  return (
    <div className="flex items-center gap-1.5">
      {/* Endpoint selector */}
      <select
        value={store.selectedEndpointId ?? ''}
        onChange={(e) => {
          const id = Number(e.target.value) || null;
          store.setEndpoint(id!);
          store.setModel('');
        }}
        className={cn(
          'bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300',
          'focus:outline-none focus:border-zinc-600 cursor-pointer',
        )}
      >
        {endpoints.length === 0 && <option value="">No endpoints</option>}
        {endpoints.map((ep) => (
          <option key={ep.id} value={ep.id}>
            {ep.name}
          </option>
        ))}
      </select>

      {/* Model selector */}
      <select
        value={store.selectedModelId}
        onChange={(e) => store.setModel(e.target.value)}
        disabled={modelList.length === 0}
        className={cn(
          'bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300',
          'focus:outline-none focus:border-zinc-600 cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'max-w-[200px] truncate',
        )}
      >
        <option value="">{modelList.length === 0 ? 'No models' : 'Select model'}</option>
        {modelList.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ModelSelector;
