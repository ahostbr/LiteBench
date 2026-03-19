import { useState } from 'react';
import { ResultsBrowser } from '@/components/results/ResultsBrowser';
import { RunDetail } from '@/components/results/RunDetail';
import { ComparisonView } from '@/components/results/ComparisonView';

type ResultsView =
  | { type: 'browser' }
  | { type: 'detail'; runId: number }
  | { type: 'compare'; runIds: number[] };

export function ResultsPanel() {
  const [view, setView] = useState<ResultsView>({ type: 'browser' });

  if (view.type === 'detail') {
    return <RunDetail runId={view.runId} onBack={() => setView({ type: 'browser' })} />;
  }

  if (view.type === 'compare') {
    return <ComparisonView runIds={view.runIds} onBack={() => setView({ type: 'browser' })} />;
  }

  return (
    <ResultsBrowser
      onSelectRun={(id) => setView({ type: 'detail', runId: id })}
      onCompare={(ids) => setView({ type: 'compare', runIds: ids })}
    />
  );
}
