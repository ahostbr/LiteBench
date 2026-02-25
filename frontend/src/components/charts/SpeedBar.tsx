import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { BenchmarkRun } from '@/api/types';
import { getModelColor } from '@/lib/colors';
import { CHART_TOOLTIP, CHART_AXIS_LABEL, CHART_SPLIT_LINE } from '@/lib/chart-theme';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface SpeedBarProps {
  runs: BenchmarkRun[];
}

export function SpeedBar({ runs }: SpeedBarProps) {
  const completedRuns = runs.filter((r) => r.status === 'completed' && r.avg_tps != null);
  if (completedRuns.length === 0) return null;

  const models = completedRuns.map((r) => r.model_name);
  const tpsValues = completedRuns.map((r) => r.avg_tps ?? 0);
  const colors = completedRuns.map((r) => getModelColor(r.model_name));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { name: string; value: number }) => `${p.name}: ${p.value} t/s`,
    },
    grid: { left: 120, right: 40, top: 10, bottom: 10 },
    xAxis: {
      type: 'value' as const,
      axisLabel: { ...CHART_AXIS_LABEL, formatter: (v: number) => `${v} t/s` },
      splitLine: CHART_SPLIT_LINE,
    },
    yAxis: {
      type: 'category' as const,
      data: models,
      axisLabel: { color: '#a1a1aa', fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: tpsValues.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
        barWidth: 24,
        label: {
          show: true,
          position: 'right' as const,
          color: '#a1a1aa',
          fontSize: 12,
          formatter: (p: { value: number }) => `${p.value} t/s`,
        },
      },
    ],
  };

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: `${Math.max(120, completedRuns.length * 50)}px` }}
    />
  );
}
