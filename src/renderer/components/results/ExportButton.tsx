import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/client';

interface ExportButtonProps {
  runId: number;
  format?: 'json' | 'csv' | 'md';
}

export function ExportButton({ runId, format = 'json' }: ExportButtonProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void api.benchmarks.export(runId, format);
      }}
    >
      <Download size={14} /> Export {format.toUpperCase()}
    </Button>
  );
}
