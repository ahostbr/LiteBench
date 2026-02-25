import { Sidebar, type Page } from './Sidebar';
import { Header } from './Header';

interface ShellProps {
  page: Page;
  onNavigate: (page: Page) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Shell({ page, onNavigate, actions, children }: ShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={page} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header page={page} actions={actions} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
