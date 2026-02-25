import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import type { Page } from '@/components/layout/Sidebar';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { RunBenchmark } from '@/components/runner/RunBenchmark';
import { ResultsBrowser } from '@/components/results/ResultsBrowser';
import { RunDetail } from '@/components/results/RunDetail';
import { ComparisonView } from '@/components/results/ComparisonView';
import { TestSuiteEditor } from '@/components/tests/TestSuiteEditor';

type View =
  | { type: 'page'; page: Page }
  | { type: 'run-detail'; runId: number }
  | { type: 'compare'; runIds: number[] };

export default function App() {
  const [view, setView] = useState<View>({ type: 'page', page: 'dashboard' });

  const currentPage = view.type === 'page' ? view.page : view.type === 'run-detail' ? 'results' : 'results';

  const handleNavigate = (page: Page) => setView({ type: 'page', page });
  const handleSelectRun = (runOrId: { id: number } | number) => {
    const id = typeof runOrId === 'number' ? runOrId : runOrId.id;
    setView({ type: 'run-detail', runId: id });
  };
  const handleCompare = (ids: number[]) => setView({ type: 'compare', runIds: ids });
  const handleBack = () => setView({ type: 'page', page: 'results' });

  return (
    <Shell page={currentPage} onNavigate={handleNavigate}>
      {view.type === 'page' && view.page === 'dashboard' && (
        <Dashboard onSelectRun={handleSelectRun} />
      )}
      {view.type === 'page' && view.page === 'runner' && <RunBenchmark />}
      {view.type === 'page' && view.page === 'results' && (
        <ResultsBrowser onSelectRun={(id) => handleSelectRun(id)} onCompare={handleCompare} />
      )}
      {view.type === 'page' && view.page === 'tests' && <TestSuiteEditor />}
      {view.type === 'run-detail' && <RunDetail runId={view.runId} onBack={handleBack} />}
      {view.type === 'compare' && <ComparisonView runIds={view.runIds} onBack={handleBack} />}
    </Shell>
  );
}
