import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, ChevronDown, ChevronUp, Beaker } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TestCaseForm } from './TestCaseForm';
import { useTestsStore } from '@/stores/tests';
import type { TestCase } from '@/api/types';

export function TestSuiteEditor() {
  const { suites, loading, fetch, seedDefaults, createSuite, deleteSuite, addCase, updateCase, deleteCase } = useTestsStore();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingCase, setEditingCase] = useState<{ suiteId: number; tc: TestCase | null } | null>(null);
  const [newSuiteName, setNewSuiteName] = useState('');
  const [showNewSuite, setShowNewSuite] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleCreateSuite = async () => {
    if (!newSuiteName) return;
    await createSuite(newSuiteName);
    setNewSuiteName('');
    setShowNewSuite(false);
  };

  const handleCaseSubmit = async (data: Record<string, unknown>) => {
    if (!editingCase) return;
    if (editingCase.tc) {
      await updateCase(editingCase.suiteId, editingCase.tc.id, data);
    } else {
      await addCase(editingCase.suiteId, data);
    }
    setEditingCase(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setShowNewSuite(!showNewSuite)}>
          <Plus size={14} /> New Suite
        </Button>
        <Button variant="secondary" size="sm" onClick={seedDefaults}>
          <Beaker size={14} /> Seed Defaults
        </Button>
      </div>

      {showNewSuite && (
        <Card>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Suite name"
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
            />
            <Button size="sm" onClick={handleCreateSuite}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewSuite(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : suites.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">No test suites. Click "Seed Defaults" to create the standard benchmark suite.</p>
        </Card>
      ) : (
        suites.map((suite) => (
          <Card key={suite.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => setExpanded(expanded === suite.id ? null : suite.id)}
                >
                  {expanded === suite.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <CardTitle>{suite.name}</CardTitle>
                  <Badge>{suite.cases.length} tests</Badge>
                  {suite.is_default && <Badge variant="info">default</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingCase({ suiteId: suite.id, tc: null })}
                  >
                    <Plus size={14} /> Add Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteSuite(suite.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {expanded === suite.id && (
              <div className="space-y-1.5">
                {suite.cases.map((tc, i) => (
                  <div
                    key={tc.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-800/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-600 w-4">{i + 1}</span>
                      <div>
                        <p className="text-sm text-zinc-200">{tc.name}</p>
                        <p className="text-xs text-zinc-500">
                          {tc.category} | {tc.test_id} | {tc.max_tokens} tokens
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingCase({ suiteId: suite.id, tc })}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => deleteCase(suite.id, tc.id)}
                        className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))
      )}

      <Modal
        open={!!editingCase}
        onClose={() => setEditingCase(null)}
        title={editingCase?.tc ? 'Edit Test Case' : 'Add Test Case'}
        className="max-w-2xl"
      >
        {editingCase && (
          <TestCaseForm
            initial={editingCase.tc ?? undefined}
            onSubmit={handleCaseSubmit}
            onCancel={() => setEditingCase(null)}
          />
        )}
      </Modal>
    </div>
  );
}
