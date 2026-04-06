import { useEffect } from 'react';
import type { PresetChallenge, ChallengeDifficulty } from '../../../shared/types';
import { useArenaStore } from '@/stores/arena-store';

const DIFFICULTY_STYLES: Record<ChallengeDifficulty, { label: string; bg: string; text: string }> = {
  easy: { label: 'Easy', bg: 'rgba(74,222,128,0.15)', text: '#4ade80' },
  medium: { label: 'Medium', bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  hard: { label: 'Hard', bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
};

interface PresetChallengesProps {
  onSelect: (preset: PresetChallenge) => void;
  selectedPresetId?: string | null;
}

export function PresetChallenges({ onSelect, selectedPresetId }: PresetChallengesProps) {
  const presets = useArenaStore((s) => s.presets);
  const loadPresets = useArenaStore((s) => s.loadPresets);

  useEffect(() => {
    if (presets.length === 0) {
      loadPresets();
    }
  }, [presets.length, loadPresets]);

  if (presets.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
        Preset Challenges
      </p>
      <div className="grid grid-cols-2 gap-2">
        {presets.map((challenge) => {
          const diff = DIFFICULTY_STYLES[challenge.difficulty] ?? DIFFICULTY_STYLES.medium;
          const isSelected = selectedPresetId === challenge.id;
          return (
            <button
              key={challenge.id}
              onClick={() => onSelect(challenge)}
              className="text-left p-3 rounded-xl border transition-all duration-150"
              style={{
                backgroundColor: isSelected ? 'rgba(201,162,77,0.08)' : 'rgba(255,255,255,0.03)',
                borderColor: isSelected ? 'rgba(201,162,77,0.4)' : 'rgba(255,255,255,0.07)',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-zinc-200">{challenge.title}</span>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: diff.bg, color: diff.text }}
                >
                  {diff.label}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{challenge.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
