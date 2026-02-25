import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

const variants = {
  default: 'bg-zinc-800 text-zinc-300',
  success: 'bg-emerald-900/30 text-emerald-400',
  warning: 'bg-amber-900/30 text-amber-400',
  error: 'bg-red-900/50 text-red-400',
  info: 'bg-blue-900/30 text-blue-400',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}

export function scoreBadge(score: number): BadgeProps['variant'] {
  if (score >= 0.8) return 'success';
  if (score >= 0.5) return 'warning';
  return 'error';
}
