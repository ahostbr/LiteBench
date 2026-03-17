import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { TestResult } from '@/api/types';
import { scoreToColor, CHART_TOOLTIP, CHART_AXIS_LABEL, CHART_SPLIT_LINE } from '@/lib/chart-theme';

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface TestScoreWaterfallProps {
  results: TestResult[];
}

export function TestScoreWaterfall({ results }: TestScoreWaterfallProps) {
  if (results.length === 0) return null;

  const sorted = [...results].sort((a, b) => b.final_score - a.final_score);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { name: string; value: number; data: { category: string } }) =>
        `${p.name}<br/>Score: ${p.value}%<br/>Category: ${p.data.category}`,
    },
    grid: { left: 12, right: 12, top: 20, bottom: 60 },
    xAxis: {
      type: 'category' as const,
      data: sorted.map((r) => r.name),
      axisLabel: {
        ...CHART_AXIS_LABEL,
        rotate: 35,
        overflow: 'truncate' as const,
        width: 80,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      max: 100,
      axisLabel: { ...CHART_AXIS_LABEL, formatter: (v: number) => `${v}%` },
      splitLine: CHART_SPLIT_LINE,
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((r) => ({
          value: Math.round(r.final_score * 100),
          category: r.category,
          itemStyle: { color: scoreToColor(r.final_score) },
        })),
        barMaxWidth: 32,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#10b981', type: 'dashed' as const, width: 1 },
          data: [{ yAxis: 80, label: { show: true, formatter: '80%', color: '#10b981', fontSize: 10 } }],
        },
      },
    ],
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '300px' }} />;
}
