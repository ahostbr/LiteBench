export const CHART_TOOLTIP = {
  backgroundColor: '#18181b',
  borderColor: '#27272a',
  textStyle: { color: '#e4e4e7', fontSize: 12 },
};

export const CHART_AXIS_LABEL = { color: '#71717a', fontSize: 11 };

export const CHART_SPLIT_LINE = { lineStyle: { color: '#27272a' } };

export const CHART_LEGEND = { textStyle: { color: '#a1a1aa', fontSize: 11 } };

export const CHART_AXIS_LINE = { lineStyle: { color: '#3f3f46' } };

export function scoreToColor(score: number): string {
  if (score >= 0.8) return '#10b981';
  if (score >= 0.5) return '#f59e0b';
  return '#ef4444';
}
