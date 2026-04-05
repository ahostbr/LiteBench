/**
 * SkillsDropdown — Lists Claude Code skills from .claude/skills/
 * and injects the slash command into the terminal PTY when clicked.
 *
 * Ported from Kuroryuu's SkillsDropdown.tsx pattern.
 */
import { useState, useRef, useEffect } from 'react';
import { Lightbulb, ChevronDown, Cpu, Wrench, Download, Sparkles } from 'lucide-react';

interface Skill {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  command: string;
}

const SKILLS: Skill[] = [
  {
    id: 'bench-orchestrator',
    label: 'Bench Orchestrator',
    description: 'Scan models, run harness, produce leaderboard',
    icon: Cpu,
    command: '/bench-orchestrator',
  },
  {
    id: 'harness-tune',
    label: 'Harness Tune',
    description: 'Tune system prompts to improve tool-calling scores',
    icon: Wrench,
    command: '/harness-tune',
  },
  {
    id: 'model-download',
    label: 'Model Download',
    description: 'Download GGUF models from HuggingFace',
    icon: Download,
    command: '/model-download',
  },
  {
    id: 'train',
    label: 'Train',
    description: 'Autonomous agent training loop',
    icon: Sparkles,
    command: '/train',
  },
];

interface SkillsDropdownProps {
  ptyId: string | null;
}

export function SkillsDropdown({ ptyId }: SkillsDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const injectSkill = (skill: Skill) => {
    if (!ptyId) return;
    // Write the slash command into the terminal as if the user typed it
    window.liteBench.pty.write(ptyId, skill.command);
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={!ptyId}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          color: open ? 'var(--accent, #c9a24d)' : 'var(--text-muted, #7a756d)',
          backgroundColor: open ? 'rgba(201,162,77,0.15)' : 'transparent',
        }}
        title="Claude Code Skills"
      >
        <Lightbulb className="w-3.5 h-3.5" />
        Skills
        <ChevronDown
          className="w-3 h-3 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-64 rounded-lg border shadow-xl overflow-hidden"
          style={{
            backgroundColor: 'var(--color-shelf, #1a1816)',
            borderColor: 'rgba(255,255,255,0.08)',
            zIndex: 50,
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-[9px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
              Claude Code Skills
            </span>
          </div>
          {SKILLS.map((skill) => {
            const Icon = skill.icon;
            return (
              <button
                key={skill.id}
                onClick={() => injectSkill(skill)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <Icon
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: 'var(--accent, #c9a24d)' }}
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>
                    {skill.label}
                  </div>
                  <div className="text-[10px] leading-snug" style={{ color: 'var(--text-muted, #7a756d)' }}>
                    {skill.description}
                  </div>
                  <span className="text-[9px] font-mono mt-0.5 inline-block" style={{ color: 'var(--accent, #c9a24d)', opacity: 0.7 }}>
                    {skill.command}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
