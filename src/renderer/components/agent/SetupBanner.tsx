import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SetupCheckResult } from '../../../shared/types';

// Components that can be 1-click installed from the banner
const INSTALLABLE: Record<string, { action: string; label: string }> = {
  playwright: { action: 'playwright-browsers', label: 'Install Chromium' },
  'duckduckgo-search': { action: 'pip-packages', label: 'Install pip packages' },
  html2text: { action: 'pip-packages', label: 'Install pip packages' },
  'yt-dlp': { action: 'yt-dlp', label: 'Install yt-dlp' },
};

interface SetupBannerProps {
  onAllReady?: () => void;
}

export function SetupBanner({ onAllReady }: SetupBannerProps) {
  const [checking, setChecking] = useState(true);
  const [results, setResults] = useState<SetupCheckResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const checks = await window.liteBench.agent.checkSetup();
      setResults(checks);
      if (checks.every((c) => c.installed)) {
        onAllReady?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup check failed');
    } finally {
      setChecking(false);
    }
  };

  const handleInstall = async (action: string) => {
    setInstalling(action);
    try {
      await window.liteBench.agent.installDep(action);
    } finally {
      setInstalling(null);
      await runCheck();
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  if (checking) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-sm text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>Checking dependencies...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 text-sm text-red-400">
        <XCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{error}</span>
        <button onClick={runCheck} className="p-1 hover:bg-zinc-800 rounded transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const allInstalled = results.every((c) => c.installed);
  const missing = results.filter((c) => !c.installed);

  if (allInstalled) return null;

  // Collect unique install actions needed
  const pendingActions = new Map<string, string>();
  for (const r of missing) {
    const installable = INSTALLABLE[r.component];
    if (installable && !pendingActions.has(installable.action)) {
      pendingActions.set(installable.action, installable.label);
    }
  }

  return (
    <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-300 mb-1.5">
            {missing.length} missing {missing.length === 1 ? 'dependency' : 'dependencies'}
          </p>
          <div className="space-y-1 mb-2">
            {results.map((r) => (
              <div key={r.component} className="flex items-center gap-2 text-xs">
                {r.installed ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span className={r.installed ? 'text-zinc-400' : 'text-zinc-200'}>
                  {r.component}
                </span>
                {r.version && (
                  <span className="text-zinc-500">{r.version}</span>
                )}
                {r.error && (
                  <span className="text-red-400/70 truncate">{r.error}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from(pendingActions.entries()).map(([action, label]) => (
              <button
                key={action}
                onClick={() => handleInstall(action)}
                disabled={installing !== null}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium',
                  'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30',
                  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {installing === action ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {installing === action ? 'Installing...' : label}
              </button>
            ))}
            <button
              onClick={runCheck}
              disabled={installing !== null}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium',
                'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700',
                'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <RefreshCw className="w-3 h-3" />
              Re-check
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SetupBanner;
