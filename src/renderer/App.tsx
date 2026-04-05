import { useState, useEffect } from 'react';
import { TitleBar } from '@/components/layout/TitleBar';
import { ActivityBar } from '@/components/workspace/ActivityBar';
import { WorkspaceArea } from '@/components/workspace/WorkspaceArea';
import { WelcomeScreen } from '@/components/workspace/WelcomeScreen';
import { EmberSparks } from '@/components/effects/EmberSparks';
import { useAppearance } from '@/hooks/useAppearance';
import { useThemeStore } from '@/stores/theme-store';

const WELCOME_KEY = 'litebench-welcome-dismissed';

export default function App() {
  useAppearance();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(WELCOME_KEY)) {
      setShowWelcome(true);
    }
  }, []);

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_KEY, '1');
    setShowWelcome(false);
  };

  const particleDensity = useThemeStore((s) => s.particleDensity);
  const particleSpeed = useThemeStore((s) => s.particleSpeed);
  const particleLifespan = useThemeStore((s) => s.particleLifespan);
  const reduceMotion = useThemeStore((s) => s.reduceMotion);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {showWelcome && <WelcomeScreen onDismiss={dismissWelcome} />}
      <EmberSparks
        particleDensity={particleDensity}
        particleSpeed={particleSpeed}
        particleLifespan={particleLifespan}
        reduceMotion={reduceMotion}
      />
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <ActivityBar />
        <WorkspaceArea />
      </div>
    </div>
  );
}
