import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { RadarComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { BenchmarkRun } from '@/api/types';
import { computeCategoryScores } from '@/lib/metrics';
import { getModelColor } from '@/lib/colors';
import { CHART_TOOLTIP, CHART_LEGEND, CHART_SPLIT_LINE, CHART_AXIS_LINE } from '@/lib/chart-theme';

echarts.use([RadarChart, RadarComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface ScoreRadarProps {
  runs: BenchmarkRun[];
}

export function ScoreRadar({ runs }: ScoreRadarProps) {
  const completedRuns = runs.filter((r) => r.status === 'completed' && r.results.length > 0);
  if (completedRuns.length === 0) return null;

  const allCategories = new Set<string>();
  for (const run of completedRuns) {
    for (const r of run.results) allCategories.add(r.category);
  }
  const categories = Array.from(allCategories);

  const series = completedRuns.map((run) => {
    const catScores = computeCategoryScores(run.results);
    const scoreMap = new Map(catScores.map((c) => [c.category, c.avgScore]));
    return {
      name: run.model_name,
      type: 'radar' as const,
      data: [
        {
          value: categories.map((cat) => Math.round((scoreMap.get(cat) ?? 0) * 100)),
          name: run.model_name,
        },
      ],
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.1 },
      itemStyle: { color: getModelColor(run.model_name) },
    };
  });

  const option = {
    backgroundColor: 'transparent',
    tooltip: CHART_TOOLTIP,
    legend: { bottom: 0, ...CHART_LEGEND },
    radar: {
      indicator: categories.map((cat) => ({ name: cat, max: 100 })),
      shape: 'polygon' as const,
      splitArea: { areaStyle: { color: ['transparent'] } },
      splitLine: CHART_SPLIT_LINE,
      axisLine: CHART_AXIS_LINE,
      axisName: { color: '#71717a', fontSize: 11 },
    },
    series,
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '350px' }} />;
}
