import { useState, useEffect } from 'react';
import { Swords, X, Plus, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEndpointsStore } from '@/stores/endpoints';
import { PresetChallenges } from './PresetChallenges';
import type { PresetChallenge } from '../../../shared/types';

interface BattleConfigProps {
  selectedModels: { endpointId: number; modelId: string }[];
  prompt: string;
  presetId: string | null;
  sequential: boolean;
  onAddModel: (endpointId: number, modelId: string) => void;
  onRemoveModel: (index: number) => void;
  onSetPrompt: (prompt: string) => void;
  onSelectPreset: (preset: PresetChallenge) => void;
  onSetSequential: (v: boolean) => void;
  onStartBattle: () => void;
}

export function BattleConfig({
  selectedModels,
  prompt,
  presetId,
  sequential,
  onAddModel,
  onRemoveModel,
  onSetPrompt,
  onSelectPreset,
  onSetSequential,
  onStartBattle,
}: BattleConfigProps) {
  const { endpoints, models, fetch: fetchEndpoints, discoverModels } = useEndpointsStore();
  const [pickerEndpointId, setPickerEndpointId] = useState<number | null>(null);
  const [pickerModelId, setPickerModelId] = useState('');

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  // Auto-select first endpoint in picker
  useEffect(() => {
    if (!pickerEndpointId && endpoints.length > 0) {
      setPickerEndpointId(endpoints[0].id);
    }
  }, [endpoints, pickerEndpointId]);

  // Discover models when picker endpoint changes
  useEffect(() => {
    if (pickerEndpointId) {
      discoverModels(pickerEndpointId);
    }
  }, [pickerEndpointId, discoverModels]);

  // Reset model selection when endpoint changes
  useEffect(() => {
    setPickerModelId('');
  }, [pickerEndpointId]);

  const pickerModels = pickerEndpointId ? models.get(pickerEndpointId) ?? [] : [];
  const canAdd = pickerEndpointId !== null && pickerModelId !== '';
  const canBattle = selectedModels.length >= 2 && prompt.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd || pickerEndpointId === null) return;
    onAddModel(pickerEndpointId, pickerModelId);
    setPickerModelId('');
  };

  const getModelLabel = (endpointId: number, modelId: string) => {
    const ep = endpoints.find((e) => e.id === endpointId);
    const short = modelId.split('/').pop() ?? modelId;
    return ep ? `${short} (${ep.name})` : short;
  };

  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(201,162,77,0.12)' }}
        >
          <Swords size={18} style={{ color: 'var(--accent-color, #c9a24d)' }} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Battle Arena</h2>
          <p className="text-xs text-zinc-500">Pick 2+ models and a challenge to compete head-to-head</p>
        </div>
      </div>

      {/* Model picker */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Competitors</p>

        {/* Selected models */}
        {selectedModels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedModels.map((m, i) => (
              <div
                key={`${m.endpointId}-${m.modelId}-${i}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                style={{
                  backgroundColor: 'rgba(201,162,77,0.1)',
                  border: '1px solid rgba(201,162,77,0.25)',
                  color: '#e8e4dc',
                }}
              >
                <span className="font-medium">{getModelLabel(m.endpointId, m.modelId)}</span>
                <button
                  onClick={() => onRemoveModel(i)}
                  className="rounded hover:opacity-70 transition-opacity"
                  style={{ color: 'rgba(201,162,77,0.7)' }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add model row */}
        <div className="flex items-center gap-2">
          <select
            value={pickerEndpointId ?? ''}
            onChange={(e) => setPickerEndpointId(Number(e.target.value) || null)}
            className={cn(
              'bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300',
              'focus:outline-none focus:border-zinc-600 cursor-pointer shrink-0',
            )}
          >
            {endpoints.length === 0 && <option value="">No endpoints</option>}
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>{ep.name}</option>
            ))}
          </select>

          <select
            value={pickerModelId}
            onChange={(e) => setPickerModelId(e.target.value)}
            disabled={pickerModels.length === 0}
            className={cn(
              'flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300',
              'focus:outline-none focus:border-zinc-600 cursor-pointer',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <option value="">{pickerModels.length === 0 ? 'No models' : 'Select model'}</option>
            {pickerModels.map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>

          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className={cn(
              'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all',
              canAdd
                ? 'hover:opacity-90'
                : 'opacity-40 cursor-not-allowed',
            )}
            style={canAdd ? { backgroundColor: 'var(--accent-color, #c9a24d)', color: '#0a0a0b' } : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a' }}
            title="Add model"
          >
            <Plus size={14} />
          </button>
        </div>

        {selectedModels.length < 2 && (
          <p className="text-[11px] text-zinc-600">Add at least 2 models to start a battle</p>
        )}
      </div>

      {/* Prompt textarea */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Challenge Prompt</p>
        <textarea
          value={prompt}
          onChange={(e) => onSetPrompt(e.target.value)}
          placeholder="Describe what to build — e.g. 'Build a modern SaaS landing page with hero section, feature grid, and pricing table'"
          rows={3}
          className={cn(
            'w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200',
            'placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none',
            'leading-relaxed',
          )}
        />
      </div>

      {/* Preset challenges */}
      <PresetChallenges onSelect={onSelectPreset} selectedPresetId={presetId} />

      {/* Execution mode toggle */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Zap size={13} style={{ color: sequential ? 'var(--text-muted, #7a756d)' : 'var(--accent-color, #c9a24d)' }} />
          <span className="text-xs text-zinc-400">Parallel Mode</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!sequential}
            onChange={(e) => onSetSequential(!e.target.checked)}
            className="sr-only peer"
          />
          <div
            className="w-8 h-4 rounded-full peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:rounded-full after:h-3 after:w-3 after:transition-all"
            style={{
              backgroundColor: sequential ? 'rgba(255,255,255,0.1)' : 'var(--accent-color, #c9a24d)',
            }}
          >
            <div
              className="absolute top-0.5 rounded-full h-3 w-3 transition-all"
              style={{
                left: sequential ? '2px' : '18px',
                backgroundColor: sequential ? '#71717a' : '#0a0a0b',
              }}
            />
          </div>
        </label>
      </div>
      <p className="text-[10px] text-zinc-600 px-1 -mt-3">
        {sequential
          ? 'Sequential — runs models one at a time (recommended for single GPU)'
          : 'Parallel — runs all models simultaneously (multi-GPU / separate endpoints)'}
      </p>

      {/* Battle button */}
      <button
        onClick={onStartBattle}
        disabled={!canBattle}
        className={cn(
          'w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all',
          canBattle ? 'hover:opacity-90 active:scale-[0.99]' : 'opacity-40 cursor-not-allowed',
        )}
        style={
          canBattle
            ? { backgroundColor: 'var(--accent-color, #c9a24d)', color: '#0a0a0b' }
            : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a' }
        }
      >
        <Swords size={16} strokeWidth={2} />
        Battle ({selectedModels.length} models)
      </button>
    </div>
  );
}
