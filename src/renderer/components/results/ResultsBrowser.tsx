import { useEffect, useState } from 'react';
import { Trash2, GitCompare, FileDown, FolderOpen } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, scoreBadge } from '@/components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { formatScore, formatTps, formatTime, formatDate } from '@/lib/format';
import { api } from '@/api/client';
import { useResultsStore } from '@/stores/results';
import type { BenchmarkRun } from '@/api/types';

interface ResultsBrowserProps {
  onSelectRun: (runId: number) => void;
  onCompare: (runIds: number[]) => void;
}

export function ResultsBrowser({ onSelectRun, onCompare }: ResultsBrowserProps) {
  const { runs, loading, fetch, deleteRun, importLegacy } = useResultsStore();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importPath, setImportPath] = useState('');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!importPath) return;
    await importLegacy(importPath);
    setImportPath('');
    setShowImport(false);
  };

  const handleBrowseImport = async () => {
    const filePath = await api.benchmarks.pickImportFile();
    if (filePath) {
      setImportPath(filePath);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {selected.size >= 2 && (
          <Button size="sm" onClick={() => onCompare(Array.from(selected))}>
            <GitCompare size={14} /> Compare ({selected.size})
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setShowImport(!showImport)}>
          <FileDown size={14} /> Import Legacy
        </Button>
      </div>

      {showImport && (
        <Card>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Path to legacy benchmark JSON (e.g. E:\...results\benchmark_20260225_094943.json)"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={handleBrowseImport}>
              <FolderOpen size={14} /> Browse
            </Button>
            <Button size="sm" onClick={handleImport}>Import</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Runs ({runs.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-zinc-500 py-4">Loading...</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">No benchmark runs yet. Run your first benchmark!</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-8">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-600 bg-zinc-800"
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(runs.map((r) => r.id)));
                      else setSelected(new Set());
                    }}
                  />
                </TH>
                <TH>ID</TH>
                <TH>Model</TH>
                <TH>Score</TH>
                <TH>Speed</TH>
                <TH>Time</TH>
                <TH>Status</TH>
                <TH>Date</TH>
                <TH className="w-8"></TH>
              </TR>
            </THead>
            <TBody>
              {runs.map((run) => (
                <TR key={run.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(run.id)}
                      onChange={() => toggleSelect(run.id)}
                      className="rounded border-zinc-600 bg-zinc-800"
                    />
                  </TD>
                  <TD className="text-zinc-500">#{run.id}</TD>
                  <TD>
                    <button
                      onClick={() => onSelectRun(run.id)}
                      className="font-medium text-zinc-200 hover:text-blue-400 transition-colors"
                    >
                      {run.model_name}
                    </button>
                  </TD>
                  <TD>
                    <Badge variant={scoreBadge(run.avg_score ?? 0)}>{formatScore(run.avg_score)}</Badge>
                  </TD>
                  <TD>{formatTps(run.avg_tps)}</TD>
                  <TD>{formatTime(run.total_time_s)}</TD>
                  <TD>
                    <Badge
                      variant={
                        run.status === 'completed' ? 'success' : run.status === 'running' ? 'info' : 'error'
                      }
                    >
                      {run.status}
                    </Badge>
                  </TD>
                  <TD className="text-zinc-500 text-xs">{formatDate(run.started_at)}</TD>
                  <TD>
                    <button
                      onClick={() => deleteRun(run.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
