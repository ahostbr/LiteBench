import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { TestResult } from '@/api/types';
import { CHART_TOOLTIP, CHART_LEGEND } from '@/lib/chart-theme';

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

interface TokenBreakdownProps {
  results: TestResult[];
}

export function TokenBreakdown({ results }: TokenBreakdownProps) {
  if (results.length === 0) return null;

  const promptTokens = results.reduce((sum, r) => sum + r.prompt_tokens, 0);
  const completionTokens = results.reduce((sum, r) => sum + r.completion_tokens, 0);
  const thinkingTokens = results.reduce((sum, r) => sum + r.thinking_tokens_approx, 0);

  const data = [
    { name: 'Prompt', value: promptTokens, itemStyle: { color: '#3b82f6' } },
    { name: 'Completion', value: completionTokens, itemStyle: { color: '#10b981' } },
  ];
  if (thinkingTokens > 0) {
    data.push({ name: 'Thinking', value: thinkingTokens, itemStyle: { color: '#8b5cf6' } });
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}: ${p.value.toLocaleString()} tokens (${p.percent}%)`,
    },
    legend: { bottom: 0, ...CHART_LEGEND },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: {
          show: true,
          color: '#a1a1aa',
          fontSize: 11,
          formatter: (p: { name: string; percent: number }) => `${p.name}\n${p.percent}%`,
        },
        labelLine: { lineStyle: { color: '#3f3f46' } },
        data,
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        },
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '40%',
        style: {
          text: total.toLocaleString(),
          fontSize: 20,
          fontWeight: 'bold',
          fill: '#e4e4e7',
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '48%',
        style: {
          text: 'total tokens',
          fontSize: 11,
          fill: '#71717a',
          textAlign: 'center',
        },
      },
    ],
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '280px' }} />;
}
