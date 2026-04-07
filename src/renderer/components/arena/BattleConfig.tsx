import { useState, useEffect } from 'react';
import { Swords, X, Plus, Zap, AlertTriangle } from 'lucide-react';
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

      {/* Execution mode — sequential by default, parallel requires confirmation */}
      <ParallelModeToggle sequential={sequential} onSetSequential={onSetSequential} />

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

/**
 * Parallel mode toggle with safety confirmation.
 * Sequential is default and safe. Parallel requires explicit acknowledgment
 * because running multiple models simultaneously can OOM the machine.
 */
function ParallelModeToggle({
  sequential,
  onSetSequential,
}: {
  sequential: boolean;
  onSetSequential: (v: boolean) => void;
}) {
  const [showWarning, setShowWarning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleToggle = () => {
    if (sequential) {
      // Trying to enable parallel — show warning first
      setShowWarning(true);
    } else {
      // Switching back to sequential — always safe
      onSetSequential(true);
      setShowWarning(false);
      setConfirmed(false);
    }
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setShowWarning(false);
    onSetSequential(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Zap size={13} style={{ color: sequential ? 'var(--text-muted, #7a756d)' : '#f59e0b' }} />
          <span className="text-xs text-zinc-400">Parallel Mode</span>
          {!sequential && (
            <span
              className="text-[9px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
            >
              ADVANCED
            </span>
          )}
        </div>
        <button
          onClick={handleToggle}
          className="w-8 h-4 rounded-full relative transition-colors"
          style={{
            backgroundColor: sequential ? 'rgba(255,255,255,0.1)' : '#f59e0b',
          }}
        >
          <div
            className="absolute top-0.5 rounded-full h-3 w-3 transition-all"
            style={{
              left: sequential ? '2px' : '18px',
              backgroundColor: sequential ? '#71717a' : '#0a0a0b',
            }}
          />
        </button>
      </div>

      <p className="text-[10px] text-zinc-600 px-1">
        {sequential
          ? 'Sequential — models run one at a time. Previous model is unloaded before the next starts. Safe for any hardware.'
          : 'Parallel — all models run simultaneously. Requires enough VRAM for all models loaded at once.'}
      </p>

      {/* Warning dialog when trying to enable parallel */}
      {showWarning && (
        <div
          className="flex flex-col gap-3 p-3 rounded-lg mx-1"
          style={{
            backgroundColor: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.25)',
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
                Parallel mode can crash your machine
              </span>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Running multiple models simultaneously loads all of them into VRAM at once.
                A single GPU cannot safely run two large models. This will cause an out-of-memory
                crash unless you have multiple GPUs or are only running very small models (~2GB each).
              </p>
              <div className="flex flex-col gap-1 mt-1">
                <p className="text-[10px] font-medium text-zinc-300">Only enable if:</p>
                <p className="text-[10px] text-zinc-500">
                  &bull; You have multiple GPUs with separate endpoints<br />
                  &bull; OR you&apos;re running only sub-2B models that fit together in VRAM<br />
                  &bull; AND you understand the risk of OOM crashes
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowWarning(false)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}
            >
              Keep Sequential
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{ backgroundColor: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}
            >
              I understand, enable parallel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
