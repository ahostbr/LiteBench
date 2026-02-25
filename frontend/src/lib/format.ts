export function formatScore(score: number | null | undefined): string {
  if (score == null) return '-';
  return score.toFixed(2);
}

export function formatTps(tps: number | null | undefined): string {
  if (tps == null) return '-';
  return `${tps.toFixed(1)} t/s`;
}

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(0)}s`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function scoreColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-400';
  if (score >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

export function scoreBg(score: number): string {
  if (score >= 0.8) return 'bg-emerald-900/30';
  if (score >= 0.5) return 'bg-amber-900/30';
  return 'bg-red-900/50';
}
