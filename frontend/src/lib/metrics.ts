import type { TestResult } from '@/api/types';

export interface CategoryScore {
  category: string;
  avgScore: number;
  avgTps: number;
  count: number;
}

export function computeCategoryScores(results: TestResult[]): CategoryScore[] {
  const map = new Map<string, { scores: number[]; tps: number[] }>();
  for (const r of results) {
    const entry = map.get(r.category) ?? { scores: [], tps: [] };
    entry.scores.push(r.final_score);
    entry.tps.push(r.tokens_per_sec);
    map.set(r.category, entry);
  }
  return Array.from(map.entries()).map(([category, { scores, tps }]) => ({
    category,
    avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    avgTps: tps.reduce((a, b) => a + b, 0) / tps.length,
    count: scores.length,
  }));
}

export function normalizeScore(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}
