import { useEffect } from 'react';
import { useThemeStore } from '@/stores/theme-store';
import { applyAccentToDOM } from '@/lib/accent';

export function useAppearance() {
  const accentColor = useThemeStore((s) => s.accentColor);
  const reduceMotion = useThemeStore((s) => s.reduceMotion);

  useEffect(() => {
    applyAccentToDOM(accentColor);
  }, [accentColor]);

  useEffect(() => {
    if (reduceMotion) {
      document.documentElement.setAttribute('data-reduce-motion', '');
    } else {
      document.documentElement.removeAttribute('data-reduce-motion');
    }
  }, [reduceMotion]);
}
