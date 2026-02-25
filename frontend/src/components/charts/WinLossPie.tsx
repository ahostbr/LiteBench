import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { BenchmarkRun } from '@/api/types';
import { getModelColor } from '@/lib/colors';
import { CHART_TOOLTIP, CHART_LEGEND } from '@/lib/chart-theme';

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

interface WinLossPieProps {
  runs: BenchmarkRun[];
}

export function WinLossPie({ runs }: WinLossPieProps) {
  if (runs.length < 2) return null;

  // Count wins per model + ties
  const wins = new Map<string, number>();
  for (const run of runs) wins.set(run.model_name, 0);
  let ties = 0;

  // Collect all shared test_ids
  const testIds = new Set<string>();
  for (const run of runs) {
    for (const r of run.results) testIds.add(r.test_id);
  }

  for (const tid of testIds) {
    const scores = runs.map((run) => ({
      model: run.model_name,
      score: run.results.find((r) => r.test_id === tid)?.final_score ?? -1,
    })).filter((s) => s.score >= 0);

    if (scores.length < 2) continue;

    const maxScore = Math.max(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === maxScore);

    if (winners.length === 1) {
      wins.set(winners[0].model, (wins.get(winners[0].model) ?? 0) + 1);
    } else {
      ties++;
    }
  }

  const data = runs.map((run) => ({
    name: run.model_name,
    value: wins.get(run.model_name) ?? 0,
    itemStyle: { color: getModelColor(run.model_name) },
  }));
  if (ties > 0) {
    data.push({ name: 'Tied', value: ties, itemStyle: { color: '#3f3f46' } });
  }

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      ...CHART_TOOLTIP,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}: ${p.value} wins (${p.percent}%)`,
    },
    legend: { bottom: 0, ...CHART_LEGEND },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['50%', '45%'],
        data,
        label: {
          show: true,
          color: '#a1a1aa',
          fontSize: 11,
          formatter: (p: { name: string; value: number }) => `${p.name}\n${p.value}`,
        },
        labelLine: { lineStyle: { color: '#3f3f46' } },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        },
      },
    ],
  };

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height: '220px' }} />;
}
