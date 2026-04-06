import type { PresetChallenge, ChallengeDifficulty } from '../../../shared/types';

const PRESET_CHALLENGES: PresetChallenge[] = [
  {
    id: 'landing',
    title: 'Landing Page',
    description: 'Build a modern SaaS landing page with hero, features, pricing, CTA',
    difficulty: 'easy',
    systemPromptAddendum: 'Focus on modern design with clear value proposition and call-to-action.',
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'Create a developer portfolio with projects, about, contact form',
    difficulty: 'easy',
    systemPromptAddendum: 'Showcase projects with clean typography and minimal design.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Design an analytics dashboard with charts, stats cards, sidebar nav',
    difficulty: 'medium',
    systemPromptAddendum: 'Include realistic data visualizations and a functional sidebar navigation.',
  },
  {
    id: 'ecommerce',
    title: 'E-Commerce',
    description: 'Build a product listing page with filters, cart, product cards',
    difficulty: 'medium',
    systemPromptAddendum: 'Implement a product grid with filter sidebar and shopping cart UI.',
  },
  {
    id: 'blog',
    title: 'Blog',
    description: 'Create a blog homepage with article cards, categories, search',
    difficulty: 'easy',
    systemPromptAddendum: 'Display posts with featured images, tags, and reading time.',
  },
  {
    id: 'restaurant',
    title: 'Restaurant',
    description: 'Design a restaurant website with menu, reservations, gallery',
    difficulty: 'hard',
    systemPromptAddendum: 'Build an appetizing menu page with reservation form and photo gallery.',
  },
];

const DIFFICULTY_STYLES: Record<ChallengeDifficulty, { label: string; bg: string; text: string }> = {
  easy: { label: 'Easy', bg: 'rgba(74,222,128,0.15)', text: '#4ade80' },
  medium: { label: 'Medium', bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  hard: { label: 'Hard', bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
};

interface PresetChallengesProps {
  onSelect: (preset: PresetChallenge) => void;
  selectedPresetId?: string | null;
}

export function PresetChallenges({ onSelect, selectedPresetId }: PresetChallengesProps) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
        Preset Challenges
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PRESET_CHALLENGES.map((challenge) => {
          const diff = DIFFICULTY_STYLES[challenge.difficulty];
          const isSelected = selectedPresetId === challenge.id;
          return (
            <button
              key={challenge.id}
              onClick={() => onSelect(challenge)}
              className="text-left p-3 rounded-xl border transition-all duration-150"
              style={{
                backgroundColor: isSelected ? 'rgba(201,162,77,0.08)' : 'rgba(255,255,255,0.03)',
                borderColor: isSelected ? 'rgba(201,162,77,0.4)' : 'rgba(255,255,255,0.07)',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-zinc-200">{challenge.title}</span>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: diff.bg, color: diff.text }}
                >
                  {diff.label}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{challenge.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
