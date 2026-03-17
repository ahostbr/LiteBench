import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { TestResult, BenchmarkRun } from '@/api/types';
import { getModelColor } from '@/lib/colors';
import { CHART_TOOLTIP, CHART_AXIS_LABEL, CHART_SPLIT_LINE, CHART_LEGEND } from '@/lib/chart-theme';

echarts.use([ScatterChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface SpeedScatterProps {
  results?: TestResult[];
  runs?: BenchmarkRun[];
}

export function SpeedScatter({ results, runs }: SpeedScatterProps) {
  // Multi-run mode
  if (runs && runs.length > 0) {
    const series = runs
      .filter((r) => r.status === 'completed' && r.results.length > 0)
      .map((run) => ({
        name: run.model_name,
        type: 'scatter' as const,
        data: run.results.map((r) => [r.tokens_per_sec, Math.round(r.final_score * 100), r.name]),
        symbolSize: 10,
        itemStyle: { color: getModelColor(run.model_name) },
      }));

    if (series.length === 0) return null;

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        ...CHART_TOOLTIP,
        formatter: (p: { data: [number, number, string]; seriesName: string }) =>
          `${p.data[2]}<br/>Model: ${p.seriesName}<br/>Speed: ${p.data[0].toFixed(1)} t/s<br/>Score: ${p.data[1]}%`,
      },
      legend: { bottom: 0, ...CHART_LEGEND },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'value' as const,
        name: 'Tokens/sec',
        nameTextStyle: { color: '#71717a', fontSize: 11 },
        axisLabel: CHART_AXIS_LABEL,
        splitLine: CHART_SPLIT_LINE,
      },
      yAxis: {
        type: 'value' as const,
        name: 'Score',
        nameTextStyle: { color: '#71717a', fontSize: 11 },
        max: 100,
        axisLabel: { ...CHART_AXIS_LABEL, formatter: (v: number) => `${v}%` },
        splitLine: CHART_SPLIT_LINE,
      },
      series,
    };

    return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '300px' }} />;
  }

  // Single-run mode: color by category
  if (!results || results.length === 0) return null;

  const categories = Array.from(new Set(results.map((r) => r.category)));
  const CATEGORY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  const series = categories.map((cat, i) => ({
    name: cat,
    type: 'scatter' as const,
    data: results
      .filter((r) => r.category === cat)
      .map((r) => [r.tokens_per_sec, Math.round(r.final_score * 100), r.name]),
    symbolSize: 12,
    itemStyle: { color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] },
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { data: [number, number, string]; seriesName: string }) =>
        `${p.data[2]}<br/>Category: ${p.seriesName}<br/>Speed: ${p.data[0].toFixed(1)} t/s<br/>Score: ${p.data[1]}%`,
    },
    legend: { bottom: 0, ...CHART_LEGEND },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'value' as const,
      name: 'Tokens/sec',
      nameTextStyle: { color: '#71717a', fontSize: 11 },
      axisLabel: CHART_AXIS_LABEL,
      splitLine: CHART_SPLIT_LINE,
    },
    yAxis: {
      type: 'value' as const,
      name: 'Score',
      nameTextStyle: { color: '#71717a', fontSize: 11 },
      max: 100,
      axisLabel: { ...CHART_AXIS_LABEL, formatter: (v: number) => `${v}%` },
      splitLine: CHART_SPLIT_LINE,
    },
    series,
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '300px' }} />;
}
