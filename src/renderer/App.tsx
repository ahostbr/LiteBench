import { TitleBar } from '@/components/layout/TitleBar';
import { ActivityBar } from '@/components/workspace/ActivityBar';
import { WorkspaceArea } from '@/components/workspace/WorkspaceArea';
import { EmberSparks } from '@/components/effects/EmberSparks';
import { MatrixRain } from '@/components/effects/MatrixRain';
import { useAppearance } from '@/hooks/useAppearance';
import { useThemeStore } from '@/stores/theme-store';

export default function App() {
  useAppearance();

  const activeTheme = useThemeStore((s) => s.activeTheme);
  const particleDensity = useThemeStore((s) => s.particleDensity);
  const particleSpeed = useThemeStore((s) => s.particleSpeed);
  const particleLifespan = useThemeStore((s) => s.particleLifespan);
  const reduceMotion = useThemeStore((s) => s.reduceMotion);

  const isMatrix = activeTheme === 'matrix';

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 relative">
      {isMatrix && !reduceMotion ? (
        <MatrixRain />
      ) : (
        <EmberSparks
          particleDensity={particleDensity}
          particleSpeed={particleSpeed}
          particleLifespan={particleLifespan}
          reduceMotion={reduceMotion}
        />
      )}
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <ActivityBar />
        <WorkspaceArea />
      </div>
    </div>
  );
}
