import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { BenchmarkRun } from '@/api/types';
import { getModelColor } from '@/lib/colors';
import { CHART_TOOLTIP, CHART_AXIS_LABEL, CHART_SPLIT_LINE, CHART_LEGEND } from '@/lib/chart-theme';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface ScoreDeltaProps {
  runs: BenchmarkRun[];
}

export function ScoreDelta({ runs }: ScoreDeltaProps) {
  if (runs.length < 2) return null;

  const [runA, runB] = runs;
  const colorA = getModelColor(runA.model_name);
  const colorB = getModelColor(runB.model_name);

  // Build map of test_id → results for both runs
  const mapA = new Map(runA.results.map((r) => [r.test_id, r]));
  const mapB = new Map(runB.results.map((r) => [r.test_id, r]));

  // Compute deltas for shared tests
  const deltas: { name: string; delta: number }[] = [];
  for (const [testId, resultA] of mapA) {
    const resultB = mapB.get(testId);
    if (resultB) {
      deltas.push({
        name: resultA.name,
        delta: Math.round((resultA.final_score - resultB.final_score) * 100),
      });
    }
  }
  deltas.sort((a, b) => b.delta - a.delta);

  if (deltas.length === 0) return null;

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { name: string; value: number }) => {
        const winner = p.value > 0 ? runA.model_name : p.value < 0 ? runB.model_name : 'TIE';
        return `${p.name}<br/>Delta: ${p.value > 0 ? '+' : ''}${p.value}%<br/>Winner: ${winner}`;
      },
    },
    legend: {
      bottom: 0,
      ...CHART_LEGEND,
      data: [runA.model_name, runB.model_name],
    },
    grid: { left: 140, right: 40, top: 10, bottom: 40 },
    xAxis: {
      type: 'value' as const,
      axisLabel: {
        ...CHART_AXIS_LABEL,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`,
      },
      splitLine: CHART_SPLIT_LINE,
    },
    yAxis: {
      type: 'category' as const,
      data: deltas.map((d) => d.name),
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
        name: runA.model_name,
        type: 'bar',
        data: deltas.map((d) => ({
          value: d.delta,
          itemStyle: { color: d.delta >= 0 ? colorA : colorB },
        })),
        barWidth: 16,
        label: {
          show: true,
          position: 'right' as const,
          color: '#a1a1aa',
          fontSize: 10,
          formatter: (p: { value: number }) =>
            Math.abs(p.value) >= 5 ? `${p.value > 0 ? '+' : ''}${p.value}%` : '',
        },
      },
      // Invisible series just for legend
      {
        name: runB.model_name,
        type: 'bar',
        data: [],
        itemStyle: { color: colorB },
      },
    ],
  };

  const height = Math.max(180, deltas.length * 28 + 60);

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: `${height}px` }} />;
}
