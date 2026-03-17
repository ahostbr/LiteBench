import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { TestResult } from '@/api/types';
import { CHART_TOOLTIP, CHART_AXIS_LABEL, CHART_SPLIT_LINE } from '@/lib/chart-theme';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface TimingBarProps {
  results: TestResult[];
}

export function TimingBar({ results }: TimingBarProps) {
  if (results.length === 0) return null;

  const sorted = [...results].sort((a, b) => b.elapsed_s - a.elapsed_s);
  const maxTime = sorted[0]?.elapsed_s ?? 1;

  function speedColor(elapsed: number): string {
    const ratio = elapsed / maxTime;
    if (ratio <= 0.33) return '#10b981';
    if (ratio <= 0.66) return '#f59e0b';
    return '#ef4444';
  }

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { name: string; value: number }) => `${p.name}: ${p.value.toFixed(1)}s`,
    },
    grid: { left: 140, right: 60, top: 10, bottom: 10 },
    xAxis: {
      type: 'value' as const,
      axisLabel: { ...CHART_AXIS_LABEL, formatter: (v: number) => `${v}s` },
      splitLine: CHART_SPLIT_LINE,
    },
    yAxis: {
      type: 'category' as const,
      data: sorted.map((r) => r.name),
      axisLabel: {
        color: '#a1a1aa',
        fontSize: 11,
        overflow: 'truncate' as const,
        width: 120,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((r) => ({
          value: Math.round(r.elapsed_s * 10) / 10,
          itemStyle: { color: speedColor(r.elapsed_s) },
        })),
        barWidth: 16,
        label: {
          show: true,
          position: 'right' as const,
          color: '#a1a1aa',
          fontSize: 11,
          formatter: (p: { value: number }) => `${p.value}s`,
        },
      },
    ],
  };

  const height = Math.max(150, sorted.length * 32 + 20);

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: `${height}px` }} />;
}
