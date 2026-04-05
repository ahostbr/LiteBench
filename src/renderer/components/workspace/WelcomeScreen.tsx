import { useState } from 'react';
import { Zap, Globe, Code, Search, Youtube, Monitor, ChevronRight, ExternalLink, X } from 'lucide-react';

const STEPS = [
  {
    title: 'Welcome to LiteBench',
    subtitle: 'The first benchmark that actually executes tools with local AI models.',
    content: (
      <div className="flex flex-col gap-4">
        <p>LiteBench tests what your local models can really do — not just text generation, but real tool use:</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Globe, label: 'Browse websites', desc: 'Navigate, read pages, click elements' },
            { icon: Search, label: 'Search the web', desc: 'Live DuckDuckGo search via browser' },
            { icon: Code, label: 'Execute code', desc: 'Python, JavaScript, and more' },
            { icon: Youtube, label: 'YouTube transcripts', desc: 'Fetch video content' },
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
    ),
  },
  {
    title: 'Step 1: Install LM Studio',
    subtitle: 'LiteBench works with any OpenAI-compatible local model server.',
    content: (
      <div className="flex flex-col gap-4">
        <p>Download and install LM Studio — it runs AI models locally on your machine.</p>
        <a
          href="https://lmstudio.ai"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.preventDefault(); window.open('https://lmstudio.ai', '_blank'); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all hover:opacity-90 self-start"
          style={{ backgroundColor: 'var(--accent, #c9a24d)', color: 'var(--color-void, #0a0a0b)' }}
        >
          <ExternalLink className="w-4 h-4" />
          Download LM Studio
        </a>
        <p className="text-[11px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
          Already have LM Studio? Make sure it's running on the default port (1234).
          Ollama and other OpenAI-compatible servers also work.
        </p>
      </div>
    ),
  },
  {
    title: 'Step 2: Download a Model',
    subtitle: 'These models have been tested and verified with LiteBench.',
    content: (
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
          Search for these in LM Studio's model browser. Start with Qwen 3 4B — it scores 100% and runs on any hardware.
        </p>
        <div className="flex flex-col gap-1.5">
          {[
            { name: 'Qwen 3 4B', params: '4B', size: '~2.5 GB', score: '100%', rec: true },
            { name: 'Gemma 4 E4B', params: '~4B', size: '~4 GB', score: '100%', rec: false },
            { name: 'Devstral Small 2', params: '24B', size: '~15 GB', score: '100%', rec: false },
            { name: 'Gemma 4 E2B Opus Distill', params: '~11B', size: '~11 GB', score: '100%', rec: false },
          ].map((m) => (
            <div key={m.name} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: m.rec ? '1px solid var(--accent, #c9a24d)' : '1px solid rgba(255,255,255,0.06)' }}>
              {m.rec && <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent, #c9a24d)' }} />}
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>{m.name}</span>
                {m.rec && <span className="text-[9px] ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent, #c9a24d)', color: 'var(--color-void, #0a0a0b)' }}>Recommended</span>}
              </div>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted, #7a756d)' }}>{m.params}</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted, #7a756d)' }}>{m.size}</span>
              <span className="text-[10px] font-mono font-medium" style={{ color: '#4ade80' }}>{m.score}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
          See all tested models in Settings → Recommended Models. Scores from real tool execution — not just JSON format checks.
        </p>
      </div>
    ),
  },
  {
    title: 'Step 3: Start Testing',
    subtitle: "You're ready to go. Here's how to use LiteBench.",
    content: (
      <div className="flex flex-col gap-3">
        {[
          { icon: Monitor, label: 'Agent Chat', desc: 'Open the Agent Chat panel, select your model, and ask it to do things — search the web, browse a site, run code. Watch tool calls fire in real time.' },
          { icon: Globe, label: 'Browser Panel', desc: 'Open the Browser panel to see the agent navigate websites live. The agent uses the same browser you see.' },
          { icon: Zap, label: 'Agent Benchmark', desc: 'Run the automated benchmark suite to score your model. Tests browser navigation, web search, code execution, and URL fetching.' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent, #c9a24d)' }} />
            <div>
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>{label}</div>
              <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted, #7a756d)' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel, #141210)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div>
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>{current.title}</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted, #7a756d)' }}>{current.subtitle}</p>
          </div>
          <button onClick={onDismiss} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--text-muted, #7a756d)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 text-[12px] leading-relaxed" style={{ color: 'var(--text-primary, #e8e4dc)' }}>
          {current.content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Step dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{ backgroundColor: i === step ? 'var(--accent, #c9a24d)' : 'rgba(255,255,255,0.15)' }}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
                style={{ color: 'var(--text-muted, #7a756d)' }}
              >
                Back
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) {
                  onDismiss();
                } else {
                  setStep(step + 1);
                }
              }}
              className="px-4 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--accent, #c9a24d)', color: 'var(--color-void, #0a0a0b)' }}
            >
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
