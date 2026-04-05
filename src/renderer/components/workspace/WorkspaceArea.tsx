import { useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceStore, type WorkspacePanel } from '@/stores/workspace-store';
import { useLayoutStore } from '@/stores/layout-store';
import { GridLayout } from './GridLayout';
import { SplitterLayout } from './SplitterLayout';
import { TabLayout } from './TabLayout';
import { WindowLayout } from './WindowLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { RunBenchmark } from '@/components/runner/RunBenchmark';
import { ResultsPanel } from '@/components/workspace/ResultsPanel';
import { TestSuiteEditor } from '@/components/tests/TestSuiteEditor';
import { SettingsPanel } from '@/components/workspace/SettingsPanel';
import { AgentPanel } from '@/components/agent/AgentPanel';
import { AgentBenchmarkPanel } from '@/components/agent-benchmark/AgentBenchmarkPanel';
import { BrowserPanel } from '@/components/browser/BrowserPanel';
import { WelcomePanel } from '@/components/workspace/WelcomePanel';
import { lazy, Suspense } from 'react';

const TerminalPanel = lazy(() => import('@/components/terminal/TerminalPanel').then(m => ({ default: m.TerminalPanel })));

function ScrollWrap({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto p-6">{children}</div>;
}

function PanelContent({ panel }: { panel: WorkspacePanel }) {
  const addPanel = useWorkspaceStore((s) => s.addPanel);

  switch (panel.type) {
    case 'welcome':
      return <ScrollWrap><WelcomePanel /></ScrollWrap>;
    case 'dashboard':
      return <ScrollWrap><Dashboard onSelectRun={() => addPanel('results')} /></ScrollWrap>;
    case 'runner':
      return <ScrollWrap><RunBenchmark /></ScrollWrap>;
    case 'results':
      return <ScrollWrap><ResultsPanel /></ScrollWrap>;
    case 'tests':
      return <ScrollWrap><TestSuiteEditor /></ScrollWrap>;
    case 'settings':
      return <ScrollWrap><SettingsPanel /></ScrollWrap>;
    case 'agent':
      return <AgentPanel />;
    case 'agent-benchmark':
      return <AgentBenchmarkPanel />;
    case 'browser':
      return <BrowserPanel />;
    case 'terminal':
      return <Suspense fallback={<div className="h-full bg-zinc-950" />}><TerminalPanel /></Suspense>;
    default:
      return null;
  }
}

export function WorkspaceArea() {
  const panels = useWorkspaceStore((s) => s.panels);
  const activePanelId = useWorkspaceStore((s) => s.activePanelId);
  const setActivePanel = useWorkspaceStore((s) => s.setActivePanel);
  const removePanel = useWorkspaceStore((s) => s.removePanel);
  const reorderPanels = useWorkspaceStore((s) => s.reorderPanels);
  const layoutMode = useLayoutStore((s) => s.layoutMode);

  // Persistent DOM hosts for panel content — survive layout switches
  const contentHostsRef = useRef(new Map<string, HTMLDivElement>());

  const contentHosts = useMemo(() => {
    const panelIds = new Set(panels.map((p) => p.id));
    for (const panel of panels) {
      if (!contentHostsRef.current.has(panel.id)) {
        const el = document.createElement('div');
        el.style.display = 'contents';
        contentHostsRef.current.set(panel.id, el);
      }
    }
    for (const [id, el] of contentHostsRef.current) {
      if (!panelIds.has(id)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        contentHostsRef.current.delete(id);
      }
    }
    return new Map(contentHostsRef.current);
  }, [panels]);

  if (panels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Open a panel from the activity bar
      </div>
    );
  }

  const renderContent = (panel: WorkspacePanel) => {
    const host = contentHosts.get(panel.id);
    if (!host) return null;
    return <div ref={(el) => { if (el && !el.contains(host)) el.appendChild(host); }} className="h-full" />;
  };

  const layoutProps = {
    panels,
    activePanelId,
    contentHosts,
    onActivate: setActivePanel,
    onClose: removePanel,
    onReorder: reorderPanels,
    renderContent,
  };

  let layout: React.ReactNode;
  switch (layoutMode) {
    case 'grid':
      layout = <GridLayout {...layoutProps} />;
      break;
    case 'splitter':
      layout = <SplitterLayout {...layoutProps} />;
      break;
    case 'tabs':
      layout = <TabLayout {...layoutProps} />;
      break;
    case 'window':
      layout = <WindowLayout {...layoutProps} />;
      break;
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 h-full">
      {layout}
      {/* Render persistent panel content via portals */}
      {panels.map((panel) => {
        const host = contentHosts.get(panel.id);
        if (!host) return null;
        return createPortal(
          <PanelContent panel={panel} />,
          host,
          `content-${panel.id}`,
        );
      })}
    </div>
  );
}
