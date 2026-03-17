import type { Page } from './Sidebar';

const titles: Record<Page, string> = {
  dashboard: 'Dashboard',
  runner: 'Run Benchmark',
  results: 'Results History',
  tests: 'Test Suites',
};

interface HeaderProps {
  page: Page;
  actions?: React.ReactNode;
}

export function Header({ page, actions }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 py-3.5">
      <h1 className="text-base font-semibold">{titles[page]}</h1>
      <div className="flex items-center gap-3">{actions}</div>
    </header>
  );
}
