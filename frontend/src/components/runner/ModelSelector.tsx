import { useState, useEffect } from 'react';
import { RefreshCw, Cpu, Brain } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useEndpointsStore } from '@/stores/endpoints';
import type { ModelInfo } from '@/api/types';

interface ModelSelectorProps {
  endpointId: number | null;
  selectedModel: string | null;
  isThinking: boolean;
  onSelect: (modelId: string) => void;
  onToggleThinking: (v: boolean) => void;
}

export function ModelSelector({ endpointId, selectedModel, isThinking, onSelect, onToggleThinking }: ModelSelectorProps) {
  const { models, discoverModels } = useEndpointsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelList = endpointId ? models.get(endpointId) ?? [] : [];

  const handleDiscover = async () => {
    if (!endpointId) return;
    setLoading(true);
    setError(null);
    try {
      await discoverModels(endpointId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to discover models');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (endpointId && modelList.length === 0) {
      handleDiscover();
    }
  }, [endpointId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Model</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleDiscover} disabled={!endpointId || loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Discover
          </Button>
        </div>
      </CardHeader>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {!endpointId ? (
        <p className="text-sm text-zinc-500">Select an endpoint first.</p>
      ) : modelList.length === 0 ? (
        <p className="text-sm text-zinc-500">{loading ? 'Discovering models...' : 'No models found. Click Discover.'}</p>
      ) : (
        <div className="space-y-1.5">
          {modelList.map((m) => (
            <div
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                selectedModel === m.id
                  ? 'bg-blue-600/15 border border-blue-600/40'
                  : 'bg-zinc-800/50 border border-transparent hover:border-zinc-700'
              }`}
            >
              <Cpu size={14} className={selectedModel === m.id ? 'text-blue-400' : 'text-zinc-600'} />
              <span className="text-sm text-zinc-200 truncate">{m.id}</span>
            </div>
          ))}
        </div>
      )}

      {selectedModel && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isThinking}
              onChange={(e) => onToggleThinking(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
            />
            <Brain size={14} className="text-violet-400" />
            <span className="text-sm text-zinc-300">Thinking model (5x token budget)</span>
          </label>
        </div>
      )}
    </Card>
  );
}
