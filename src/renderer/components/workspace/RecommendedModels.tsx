import { ExternalLink, Trophy, Cpu, Zap, Star } from 'lucide-react';

interface ModelEntry {
  name: string;
  id: string;
  params: string;
  score: number;
  grade: string;
  size: string;
  notes: string;
  lmStudioSearch: string;
  tier: 'gold' | 'silver' | 'bronze';
}

const MODELS: ModelEntry[] = [
  {
    name: 'Devstral Small 2',
    id: 'mistralai/devstral-small-2-2512',
    params: '24B',
    score: 100,
    grade: 'A+',
    size: '~15 GB',
    notes: 'Best overall agent. Fast, reliable, perfect tool use.',
    lmStudioSearch: 'devstral-small-2',
    tier: 'gold',
  },
  {
    name: 'Gemma 4 E2B Opus Distill',
    id: 'gemma-4-e2b-it-claude-opus-distill',
    params: '~11B',
    score: 100,
    grade: 'A+',
    size: '~11 GB',
    notes: 'Plans before acting. Claude-quality reasoning in a local model.',
    lmStudioSearch: 'gemma-4-e2b-claude-opus-distill',
    tier: 'gold',
  },
  {
    name: 'Gemma 4 31B Opus Distill',
    id: 'gemma-4-31b-it-claude-opus-distill',
    params: '31B',
    score: 100,
    grade: 'A+',
    size: '~21 GB',
    notes: 'Chain-of-thought reasoning. Needs 32GB+ VRAM.',
    lmStudioSearch: 'gemma-4-31b-claude-opus-distill',
    tier: 'gold',
  },
  {
    name: 'Qwen 3 4B',
    id: 'qwen/qwen3-4b-2507',
    params: '4B',
    score: 100,
    grade: 'A+',
    size: '~2.5 GB',
    notes: 'Best small model. Runs on any hardware. Perfect scores.',
    lmStudioSearch: 'qwen3-4b',
    tier: 'gold',
  },
  {
    name: 'Gemma 4 31B',
    id: 'gemma-4-31b-it',
    params: '31B',
    score: 100,
    grade: 'A+',
    size: '~18 GB',
    notes: 'Powerful but generates many tool calls. Needs stream cap.',
    lmStudioSearch: 'gemma-4-31b-it',
    tier: 'gold',
  },
  {
    name: 'Gemma 4 E4B',
    id: 'gemma-4-e4b-it',
    params: '~4B',
    score: 100,
    grade: 'A+',
    size: '~4 GB',
    notes: 'Tiny and perfect. Great for laptops.',
    lmStudioSearch: 'gemma-4-e4b-it',
    tier: 'gold',
  },
  {
    name: 'Gemma 4 26B-A4B',
    id: 'google/gemma-4-26b-a4b',
    params: '26B',
    score: 93,
    grade: 'A',
    size: '~18 GB',
    notes: 'Mixture-of-experts. Only 4B active params, fast inference.',
    lmStudioSearch: 'gemma-4-26b-a4b',
    tier: 'silver',
  },
  {
    name: 'Gemma 3 4B',
    id: 'gemma-3-4b-it',
    params: '4B',
    score: 93,
    grade: 'A',
    size: '~2.4 GB',
    notes: 'Uses XML tool calling fallback. Reliable for its size.',
    lmStudioSearch: 'gemma-3-4b-it',
    tier: 'silver',
  },
  {
    name: 'Qwen 3.5 0.8B Opus Distill',
    id: 'qwen3.5-0.8b-uncensored-opus-distill',
    params: '752M',
    score: 87,
    grade: 'B+',
    size: '~528 MB',
    notes: 'Remarkable for sub-1B. Runs on anything with a CPU.',
    lmStudioSearch: 'qwen3.5-0.8b-opus-distill',
    tier: 'bronze',
  },
  {
    name: 'xLAM 2 1B',
    id: 'xlam-2-1b-fc-r',
    params: '1B',
    score: 80,
    grade: 'B',
    size: '~940 MB',
    notes: 'Salesforce function-calling specialist. Good at calling, weaker at synthesis.',
    lmStudioSearch: 'xLAM-2-1b-fc-r',
    tier: 'bronze',
  },
];

const tierColors = {
  gold: 'var(--accent, #c9a24d)',
  silver: '#94a3b8',
  bronze: '#b45309',
};

const gradeColors: Record<string, string> = {
  'A+': '#4ade80',
  'A': '#4ade80',
  'B+': '#60a5fa',
  'B': '#60a5fa',
  'C': '#fbbf24',
  'D': '#f87171',
  'F': '#ef4444',
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 95 ? '#4ade80' : score >= 80 ? '#60a5fa' : score >= 60 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] tabular-nums font-medium" style={{ color }}>{score}%</span>
    </div>
  );
}

export function RecommendedModels() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4" style={{ color: 'var(--accent, #c9a24d)' }} />
        <h3 className="font-display italic text-xl" style={{ color: 'var(--text-primary, #e8e4dc)' }}>
          Recommended Models
        </h3>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted, #7a756d)' }}>
        Models tested with LiteBench's agent harness — real tool execution across web search,
        browser navigation, code sandbox, and URL fetching. Scores reflect the full agent loop:
        call tool, get result, synthesize response.
      </p>

      {/* Legend */}
      <div className="flex gap-4 text-[10px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
        <span className="flex items-center gap-1">
          <Star className="w-3 h-3" style={{ color: tierColors.gold }} fill={tierColors.gold} />
          100% — Perfect
        </span>
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3" style={{ color: tierColors.silver }} />
          90%+ — Excellent
        </span>
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3" style={{ color: tierColors.bronze }} />
          80%+ — Good
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-divider, rgba(255,255,255,0.07))' }}>
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>Model</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>Params</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>Size</th>
              <th className="text-left px-2 py-2 font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>Score</th>
              <th className="text-left px-2 py-2 font-medium hidden lg:table-cell" style={{ color: 'var(--text-muted, #7a756d)' }}>Notes</th>
              <th className="text-center px-2 py-2 font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}></th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((model, i) => (
              <tr
                key={model.id}
                className="border-t transition-colors hover:bg-white/[0.02]"
                style={{ borderColor: 'var(--color-divider, rgba(255,255,255,0.05))' }}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {model.tier === 'gold' && (
                      <Star className="w-3 h-3 shrink-0" style={{ color: tierColors.gold }} fill={tierColors.gold} />
                    )}
                    {model.tier === 'silver' && (
                      <Zap className="w-3 h-3 shrink-0" style={{ color: tierColors.silver }} />
                    )}
                    {model.tier === 'bronze' && (
                      <Cpu className="w-3 h-3 shrink-0" style={{ color: tierColors.bronze }} />
                    )}
                    <div>
                      <div className="font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>
                        {model.name}
                      </div>
                      <div className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--text-muted, #7a756d)' }}>
                        {model.id}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="text-center px-2 py-2.5 font-mono" style={{ color: 'var(--text-primary, #e8e4dc)' }}>
                  {model.params}
                </td>
                <td className="text-center px-2 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
                  {model.size}
                </td>
                <td className="px-2 py-2.5">
                  <ScoreBar score={model.score} />
                </td>
                <td className="px-2 py-2.5 hidden lg:table-cell max-w-[200px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
                  {model.notes}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <a
                    href={`https://lmstudio.ai/models?q=${encodeURIComponent(model.lmStudioSearch)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--accent, #c9a24d)',
                      color: 'var(--color-void, #0a0a0b)',
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      window.open(`https://lmstudio.ai/models?q=${encodeURIComponent(model.lmStudioSearch)}`, '_blank');
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Get
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
        Scores from LiteBench Agent Harness v1 — 5 tests: browser navigation, web search,
        page reading, code execution, URL fetching. All tools execute for real.
        Download models via LM Studio, then select them in the Agent Chat panel.
      </p>
    </div>
  );
}
