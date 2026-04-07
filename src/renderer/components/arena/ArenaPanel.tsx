import { Swords, X } from 'lucide-react';
import { useArenaStore } from '@/stores/arena-store';
import { BattleConfig } from './BattleConfig';
import { ArenaGrid } from './ArenaGrid';

// JudgingPanel is built by frontend-2 — lazy import to avoid circular deps at bundle time
import { lazy, Suspense } from 'react';
const JudgingPanel = lazy(() =>
  import('./JudgingPanel').then((m) => ({ default: m.JudgingPanel })),
);

export function ArenaPanel() {
  const store = useArenaStore();
  const {
    phase,
    activeBattle,
    competitorStates,
    selectedModels,
    prompt,
    presetId,
    sequential,
    addModel,
    removeModel,
    setPrompt,
    selectPreset,
    setSequential,
    startBattle,
    cancelBattle,
    error,
  } = store;

  const isConfiguring = phase === 'configuring';
  const isBuilding = phase === 'building';
  const isJudging = (phase === 'judging' || phase === 'results') && activeBattle !== null;

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Panel header (only shown during battle/judging) */}
      {!isConfiguring && (
        <div
          className="flex items-center gap-2 px-3 py-2 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Swords size={15} style={{ color: 'var(--accent-color, #c9a24d)' }} strokeWidth={1.5} />
          <span className="text-sm font-medium text-zinc-200 flex-1 truncate">
            {isBuilding ? 'Battle in Progress' : 'Results'}
          </span>

          {/* Phase badge */}
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: isBuilding ? 'rgba(96,165,250,0.15)' : 'rgba(74,222,128,0.15)',
              color: isBuilding ? '#60a5fa' : '#4ade80',
            }}
          >
            {isBuilding ? 'Building' : phase === 'judging' ? 'Judging' : 'Results'}
          </span>

          {/* Cancel (only during building) */}
          {isBuilding && (
            <button
              onClick={cancelBattle}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Cancel battle"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-2 text-xs shrink-0"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderBottom: '1px solid rgba(239,68,68,0.2)' }}
        >
          Battle error: {error}
        </div>
      )}

      {/* Content */}
      {isConfiguring && (
        <div className="flex-1 overflow-y-auto">
          <BattleConfig
            selectedModels={selectedModels}
            prompt={prompt}
            presetId={presetId}
            sequential={sequential}
            onAddModel={addModel}
            onRemoveModel={removeModel}
            onSetPrompt={setPrompt}
            onSelectPreset={selectPreset}
            onSetSequential={setSequential}
            onStartBattle={startBattle}
          />
        </div>
      )}

      {isBuilding && (
        activeBattle ? (
          <ArenaGrid
            battleId={activeBattle.id}
            competitors={activeBattle.competitors}
            competitorStates={competitorStates}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-8 h-8 border-2 rounded-full animate-spin"
                style={{ borderColor: 'rgba(201,162,77,0.2)', borderTopColor: 'var(--accent-color, #c9a24d)' }}
              />
              <span className="text-sm text-zinc-500">Starting battle...</span>
            </div>
          </div>
        )
      )}

      {isJudging && activeBattle && (
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
              Loading results...
            </div>
          }
        >
          <JudgingPanel />
        </Suspense>
      )}
    </div>
  );
}

export default ArenaPanel;
