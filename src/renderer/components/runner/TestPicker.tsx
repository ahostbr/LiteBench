import { useEffect } from 'react';
import { FlaskConical } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useTestsStore } from '@/stores/tests';

interface TestPickerProps {
  selectedSuiteId: number | null;
  onSelect: (suiteId: number) => void;
}

export function TestPicker({ selectedSuiteId, onSelect }: TestPickerProps) {
  const { suites, loading, fetch, seedDefaults } = useTestsStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleSeed = async () => {
    await seedDefaults();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Test Suite</CardTitle>
          {suites.length === 0 && (
            <Button variant="secondary" size="sm" onClick={handleSeed}>
              Seed Defaults
            </Button>
          )}
        </div>
      </CardHeader>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : suites.length === 0 ? (
        <p className="text-sm text-zinc-500">No test suites. Click "Seed Defaults" to create the standard benchmark suite.</p>
      ) : (
        <div className="space-y-1.5">
          {suites.map((suite) => (
            <div
              key={suite.id}
              onClick={() => onSelect(suite.id)}
              className={`rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                selectedSuiteId === suite.id
                  ? 'bg-blue-600/15 border border-blue-600/40'
                  : 'bg-zinc-800/50 border border-transparent hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical size={14} className={selectedSuiteId === suite.id ? 'text-blue-400' : 'text-zinc-600'} />
                  <span className="text-sm font-medium text-zinc-200">{suite.name}</span>
                </div>
                <Badge>{suite.cases.length} tests</Badge>
              </div>
              {suite.description && (
                <p className="text-xs text-zinc-500 mt-1 ml-6">{suite.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
