import { TitleBar } from '@/components/layout/TitleBar';
import { ActivityBar } from '@/components/workspace/ActivityBar';
import { WorkspaceArea } from '@/components/workspace/WorkspaceArea';
import { useAppearance } from '@/hooks/useAppearance';

export default function App() {
  useAppearance();

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <ActivityBar />
        <WorkspaceArea />
      </div>
    </div>
  );
}
