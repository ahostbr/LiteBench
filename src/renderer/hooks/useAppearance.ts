import { useEffect } from 'react';
import { useThemeStore } from '@/stores/theme-store';
import {
  applyThemeToDOM,
  applyGlassBlurToDOM,
  applyParticleColorToDOM,
  applyGlowColorToDOM,
  applyParticleSpeedToDOM,
} from '@/lib/accent';
import { getThemeById } from '@/lib/themes';

export function useAppearance() {
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const accentColor = useThemeStore((s) => s.accentColor);
  const glassBlur = useThemeStore((s) => s.glassBlur);
  const reduceMotion = useThemeStore((s) => s.reduceMotion);
  const particleColor = useThemeStore((s) => s.particleColor);
  const glowColor = useThemeStore((s) => s.glowColor);
  const particleSpeed = useThemeStore((s) => s.particleSpeed);

  useEffect(() => {
    const theme = getThemeById(activeTheme);
    if (theme) {
      applyThemeToDOM(theme);
    }
  }, [activeTheme]);

  useEffect(() => {
    applyGlassBlurToDOM(glassBlur);
  }, [glassBlur]);

  useEffect(() => {
    applyParticleColorToDOM(particleColor);
  }, [particleColor]);

  useEffect(() => {
    applyGlowColorToDOM(glowColor);
  }, [glowColor]);

  useEffect(() => {
    applyParticleSpeedToDOM(particleSpeed);
  }, [particleSpeed]);

  useEffect(() => {
    if (reduceMotion) {
      document.documentElement.setAttribute('data-reduce-motion', '');
    } else {
      document.documentElement.removeAttribute('data-reduce-motion');
    }
  }, [reduceMotion]);

  // Apply custom accent override on top of theme when accentColor diverges
  // (handled inside applyThemeToDOM already for theme loads; this catches manual overrides)
}
