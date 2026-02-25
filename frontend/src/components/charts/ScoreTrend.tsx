import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { BenchmarkRun } from '@/api/types';
import { getModelColor } from '@/lib/colors';
import { CHART_TOOLTIP, CHART_AXIS_LABEL, CHART_SPLIT_LINE, CHART_LEGEND } from '@/lib/chart-theme';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface ScoreTrendProps {
  runs: BenchmarkRun[];
}

export function ScoreTrend({ runs }: ScoreTrendProps) {
  const completed = runs
    .filter((r) => r.status === 'completed' && r.avg_score != null && r.started_at)
    .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime());

  if (completed.length === 0) return null;

  // Group by model
  const modelGroups = new Map<string, { date: string; score: number }[]>();
  for (const run of completed) {
    const points = modelGroups.get(run.model_name) ?? [];
    points.push({
      date: new Date(run.started_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: Math.round((run.avg_score ?? 0) * 100),
    });
    modelGroups.set(run.model_name, points);
  }

  // All unique dates in order
  const allDates = completed.map((r) =>
    new Date(r.started_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const uniqueDates = Array.from(new Set(allDates));

  const series = Array.from(modelGroups.entries()).map(([model, points]) => {
    const dateMap = new Map(points.map((p) => [p.date, p.score]));
    return {
      name: model,
      type: 'line' as const,
      data: uniqueDates.map((d) => dateMap.get(d) ?? null),
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2 },
      itemStyle: { color: getModelColor(model) },
      connectNulls: false,
    };
  });

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      trigger: 'axis' as const,
    },
    legend: { bottom: 0, ...CHART_LEGEND },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: uniqueDates,
      axisLabel: CHART_AXIS_LABEL,
      axisLine: { lineStyle: { color: '#3f3f46' } },
    },
    yAxis: {
      type: 'value' as const,
      max: 100,
      axisLabel: { ...CHART_AXIS_LABEL, formatter: (v: number) => `${v}%` },
      splitLine: CHART_SPLIT_LINE,
    },
    series,
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '300px' }} />;
}
