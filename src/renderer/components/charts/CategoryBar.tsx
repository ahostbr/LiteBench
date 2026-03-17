import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { TestResult } from '@/api/types';
import { computeCategoryScores } from '@/lib/metrics';
import { scoreToColor, CHART_TOOLTIP, CHART_AXIS_LABEL, CHART_SPLIT_LINE } from '@/lib/chart-theme';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface CategoryBarProps {
  results: TestResult[];
}

export function CategoryBar({ results }: CategoryBarProps) {
  if (results.length === 0) return null;

  const categories = computeCategoryScores(results).sort((a, b) => b.avgScore - a.avgScore);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { name: string; value: number }) =>
        `${p.name}: ${p.value}% (${categories.find((c) => c.category === p.name)?.count ?? 0} tests)`,
    },
    grid: { left: 120, right: 50, top: 10, bottom: 10 },
    xAxis: {
      type: 'value' as const,
      max: 100,
      axisLabel: { ...CHART_AXIS_LABEL, formatter: (v: number) => `${v}%` },
      splitLine: CHART_SPLIT_LINE,
    },
    yAxis: {
      type: 'category' as const,
      data: categories.map((c) => c.category),
      axisLabel: { color: '#a1a1aa', fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: categories.map((c) => ({
          value: Math.round(c.avgScore * 100),
          itemStyle: { color: scoreToColor(c.avgScore) },
        })),
        barWidth: 20,
        label: {
          show: true,
          position: 'right' as const,
          color: '#a1a1aa',
          fontSize: 12,
          formatter: (p: { value: number }) => `${p.value}%`,
        },
      },
    ],
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '250px' }} />;
}
