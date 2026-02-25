import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { BenchmarkRun } from '@/api/types';
import { computeCategoryScores } from '@/lib/metrics';
import { CHART_TOOLTIP, CHART_AXIS_LABEL } from '@/lib/chart-theme';

echarts.use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

interface CategoryHeatmapProps {
  runs: BenchmarkRun[];
}

export function CategoryHeatmap({ runs }: CategoryHeatmapProps) {
  const completedRuns = runs.filter((r) => r.status === 'completed' && r.results.length > 0);
  if (completedRuns.length === 0) return null;

  // Collect all categories
  const allCategories = new Set<string>();
  for (const run of completedRuns) {
    for (const r of run.results) allCategories.add(r.category);
  }
  const categories = Array.from(allCategories);
  const models = completedRuns.map((r) => r.model_name);

  // Build heatmap data: [categoryIndex, modelIndex, score]
  const data: [number, number, number][] = [];
  for (let mi = 0; mi < completedRuns.length; mi++) {
    const catScores = computeCategoryScores(completedRuns[mi].results);
    const scoreMap = new Map(catScores.map((c) => [c.category, c.avgScore]));
    for (let ci = 0; ci < categories.length; ci++) {
      data.push([ci, mi, Math.round((scoreMap.get(categories[ci]) ?? 0) * 100)]);
    }
  }

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { data: [number, number, number] }) => {
        const [ci, mi, score] = p.data;
        return `${models[mi]}<br/>${categories[ci]}: ${score}%`;
      },
    },
    grid: { left: 120, right: 80, top: 10, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: categories,
      axisLabel: { ...CHART_AXIS_LABEL, rotate: 30 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category' as const,
      data: models,
      axisLabel: { color: '#a1a1aa', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      orient: 'vertical' as const,
      right: 0,
      top: 'center',
      inRange: { color: ['#7f1d1d', '#991b1b', '#b45309', '#d97706', '#059669', '#10b981'] },
      textStyle: { color: '#71717a', fontSize: 10 },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: true,
          color: '#e4e4e7',
          fontSize: 12,
          fontWeight: 'bold' as const,
          formatter: (p: { data: [number, number, number] }) => `${p.data[2]}%`,
        },
        itemStyle: { borderWidth: 2, borderColor: '#09090b' },
      },
    ],
  };

  const height = Math.max(160, completedRuns.length * 50 + 60);

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: `${height}px` }} />;
}
