import { Sidebar, type Page } from './Sidebar';
import { Header } from './Header';
import { TitleBar } from './TitleBar';

interface ShellProps {
  page: Page;
  onNavigate: (page: Page) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Shell({ page, onNavigate, actions, children }: ShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar active={page} onNavigate={onNavigate} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header page={page} actions={actions} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
