import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  accentColor: string;
  reduceMotion: boolean;
  setAccentColor: (color: string) => void;
  setReduceMotion: (value: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      accentColor: '#3a8ec0', // Electric blue default
      reduceMotion: false,
      setAccentColor: (color) => set({ accentColor: color }),
      setReduceMotion: (value) => set({ reduceMotion: value }),
    }),
    {
      name: 'litebench-theme',
    },
  ),
);
