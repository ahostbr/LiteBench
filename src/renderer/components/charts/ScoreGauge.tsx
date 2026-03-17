import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { GaugeChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([GaugeChart, TooltipComponent, CanvasRenderer]);

interface ScoreGaugeProps {
  score: number | null;
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  if (score == null) return null;

  const value = Math.round(score * 100);

  const option = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        pointer: { show: true, length: '55%', width: 4, itemStyle: { color: '#a1a1aa' } },
        progress: { show: true, width: 16, roundCap: true },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 16,
            color: [
              [0.5, '#ef4444'],
              [0.8, '#f59e0b'],
              [1, '#10b981'],
            ],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: '#71717a',
          fontSize: 10,
          distance: 12,
          formatter: (v: number) => (v % 50 === 0 ? `${v}` : ''),
        },
        detail: {
          valueAnimation: true,
          formatter: '{value}',
          color: '#e4e4e7',
          fontSize: 28,
          fontWeight: 'bold' as const,
          offsetCenter: [0, '70%'],
        },
        data: [{ value }],
      },
    ],
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '220px' }} />;
}
