import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/client';

interface ExportButtonProps {
  runId: number;
  format?: 'json' | 'csv' | 'md';
}

export function ExportButton({ runId, format = 'json' }: ExportButtonProps) {
  return (
    <a href={api.benchmarks.exportUrl(runId, format)} download>
      <Button variant="secondary" size="sm">
        <Download size={14} /> Export {format.toUpperCase()}
      </Button>
    </a>
  );
}
