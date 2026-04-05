import { Zap, Globe, Code, Search, Youtube, Monitor, ExternalLink, ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { RecommendedModels } from './RecommendedModels';

export function WelcomePanel() {
  const addPanel = useWorkspaceStore((s) => s.addPanel);

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-display italic" style={{ color: 'var(--text-primary, #e8e4dc)' }}>
          Welcome to LiteBench
        </h1>
        <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted, #7a756d)' }}>
          The first benchmark that actually executes tools with local AI models.
          Not just checking JSON format — real browser navigation, web search, code execution.
        </p>
      </div>

      {/* What it does */}
      <div>
        <h3 className="text-[10px] uppercase tracking-widest font-medium mb-3" style={{ color: 'var(--text-muted, #7a756d)' }}>
          What Your Models Can Do
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Globe, label: 'Browse websites', desc: 'Navigate, read pages, click elements in a real browser' },
            { icon: Search, label: 'Search the web', desc: 'Live DuckDuckGo search — no API keys needed' },
            { icon: Code, label: 'Execute code', desc: 'Python, JavaScript, and 10+ languages in a sandbox' },
            { icon: Youtube, label: 'YouTube transcripts', desc: 'Fetch and analyze video content' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent, #c9a24d)' }} />
              <div>
                <div className="text-[12px] font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>{label}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted, #7a756d)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Getting Started */}
      <div>
        <h3 className="text-[10px] uppercase tracking-widest font-medium mb-3" style={{ color: 'var(--text-muted, #7a756d)' }}>
          Getting Started
        </h3>
        <div className="flex flex-col gap-2">
          <StepCard
            number="1"
            title="Install LM Studio"
            desc="Download and run LM Studio — it serves AI models locally on your machine."
            action={
              <a
                href="https://lmstudio.ai"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.preventDefault(); window.open('https://lmstudio.ai', '_blank'); }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-all hover:opacity-80"
                style={{ backgroundColor: 'var(--accent, #c9a24d)', color: 'var(--color-void, #0a0a0b)' }}
              >
                <ExternalLink className="w-3 h-3" />
                Download
              </a>
            }
          />
          <StepCard
            number="2"
            title="Download a model"
            desc="Start with Qwen 3 4B (2.5 GB, scores 100%) — see the full leaderboard below."
          />
          <StepCard
            number="3"
            title="Open Agent Chat"
            desc="Select your endpoint and model, then ask the agent to do things — search, browse, run code."
            action={
              <button
                onClick={() => addPanel('agent')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-all hover:opacity-80"
                style={{ backgroundColor: 'var(--accent, #c9a24d)', color: 'var(--color-void, #0a0a0b)' }}
              >
                Open Agent Chat
                <ChevronRight className="w-3 h-3" />
              </button>
            }
          />
        </div>
      </div>

      {/* Quick launch buttons */}
      <div>
        <h3 className="text-[10px] uppercase tracking-widest font-medium mb-3" style={{ color: 'var(--text-muted, #7a756d)' }}>
          Quick Launch
        </h3>
        <div className="flex gap-2 flex-wrap">
          {[
            { type: 'agent' as const, icon: Monitor, label: 'Agent Chat' },
            { type: 'browser' as const, icon: Globe, label: 'Browser' },
            { type: 'agent-benchmark' as const, icon: Zap, label: 'Agent Benchmark' },
            { type: 'terminal' as const, icon: Code, label: 'Terminal' },
            { type: 'dashboard' as const, icon: Monitor, label: 'Dashboard' },
          ].map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => addPanel(type)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-all hover:bg-white/5"
              style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary, #e8e4dc)' }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent, #c9a24d)' }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t" style={{ borderColor: 'var(--color-divider, rgba(255,255,255,0.07))' }} />

      {/* Recommended Models */}
      <RecommendedModels />
    </div>
  );
}

function StepCard({ number, title, desc, action }: { number: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
        style={{ backgroundColor: 'var(--accent, #c9a24d)', color: 'var(--color-void, #0a0a0b)' }}
      >
        {number}
      </div>
      <div className="flex-1">
        <div className="text-[12px] font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>{title}</div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted, #7a756d)' }}>{desc}</div>
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
