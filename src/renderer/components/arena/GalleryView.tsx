import { useEffect, useState } from 'react';
import { Trophy, Calendar, Users, ChevronRight, ImageOff } from 'lucide-react';
import { useArenaStore } from '@/stores/arena-store';
import type { Battle } from '../../../shared/types';
import { JudgingPanel } from './JudgingPanel';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function BattleCard({ battle, onClick }: { battle: Battle; onClick: () => void }) {
  const winner = battle.competitors.find((c) => c.id === battle.winnerId);
  const promptExcerpt = battle.prompt.length > 60 ? battle.prompt.slice(0, 60) + '…' : battle.prompt;
  const modelNames = battle.competitors.map((c) => c.modelId).join(' vs ');

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/70 transition-all overflow-hidden"
    >
      {/* Thumbnail placeholder */}
      <div className="h-28 bg-zinc-950 border-b border-zinc-800 relative flex items-center justify-center">
        {winner?.outputDir ? (
          <iframe
            src={`file://${winner.outputDir}/index.html`}
            className="w-full h-full border-0 pointer-events-none"
            sandbox="allow-scripts allow-same-origin"
            title="Battle thumbnail"
          />
        ) : (
          <ImageOff size={20} className="text-zinc-700" />
        )}
        {winner && (
          <div className="absolute top-2 right-2 bg-yellow-500/90 text-zinc-900 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
            <Trophy size={9} />
            {winner.modelId}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        <p className="text-xs text-zinc-200 leading-relaxed line-clamp-2">{promptExcerpt}</p>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Users size={10} />
          <span className="truncate flex-1">{modelNames}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-600">
          <span className="flex items-center gap-1">
            <Calendar size={10} />
            {formatDate(battle.createdAt)}
          </span>
          <ChevronRight
            size={12}
            className="text-zinc-700 group-hover:text-zinc-400 transition-colors"
          />
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
      <Trophy size={36} className="text-zinc-700" />
      <p className="text-sm font-medium text-zinc-500">No battles yet</p>
      <p className="text-xs text-zinc-600 max-w-xs">
        Start a battle from the Arena panel to see results here.
      </p>
    </div>
  );
}

export function GalleryView() {
  const gallery = useArenaStore((s) => s.gallery);
  const activeBattle = useArenaStore((s) => s.activeBattle);
  const loadGallery = useArenaStore((s) => s.loadGallery);
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);

  useEffect(() => {
    loadGallery();
  }, []);

  // If a battle detail is open, show the judging panel in read-only mode
  if (selectedBattle) {
    // Temporarily override the active battle state for the judging panel by patching it into the store
    return (
      <BattleDetailView battle={selectedBattle} onClose={() => setSelectedBattle(null)} />
    );
  }

  // Don't show gallery if there's an active battle in progress
  if (activeBattle && (activeBattle.phase === 'building' || activeBattle.phase === 'judging')) {
    return null;
  }

  const sorted = [...gallery].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
        <Trophy size={15} className="text-yellow-400" />
        <h2 className="text-sm font-semibold text-zinc-100">Battle Gallery</h2>
        <span className="text-xs text-zinc-600 ml-1">({sorted.length})</span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {sorted.map((battle) => (
              <BattleCard
                key={battle.id}
                battle={battle}
                onClick={() => setSelectedBattle(battle)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Read-only battle detail view — passes the battle as a prop instead of hijacking the store
function BattleDetailView({ battle, onClose }: { battle: Battle; onClose: () => void }) {
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <button
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Gallery
        </button>
        <span className="text-zinc-600">/</span>
        <span className="text-xs text-zinc-400 truncate">{battle.prompt.slice(0, 50)}</span>
      </div>
      <div className="flex-1 min-h-0">
        <JudgingPanel readOnly battle={battle} />
      </div>
    </div>
  );
}
