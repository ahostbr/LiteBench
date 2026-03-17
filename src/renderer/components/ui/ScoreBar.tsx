import { cn } from '@/lib/utils';

interface ScoreBarProps {
  score: number;
  className?: string;
  showLabel?: boolean;
}

export function ScoreBar({ score, className, showLabel = true }: ScoreBarProps) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.8 ? 'bg-emerald-500' : score >= 0.5 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>}
    </div>
  );
}
