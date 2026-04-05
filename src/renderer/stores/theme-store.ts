import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME_ID } from '@/lib/themes';

interface ThemeState {
  activeTheme: string;
  accentColor: string;
  glassBlur: number;
  reduceMotion: boolean;
  particleDensity: number;
  particleSpeed: number;
  particleLifespan: number;
  particleColor: string;
  glowColor: string;
  matrixRainOpacity: number;
  backgroundOpacity: number;
  setActiveTheme: (id: string) => void;
  setAccentColor: (color: string) => void;
  setGlassBlur: (blur: number) => void;
  setReduceMotion: (value: boolean) => void;
  setParticleDensity: (v: number) => void;
  setParticleSpeed: (v: number) => void;
  setParticleLifespan: (v: number) => void;
  setParticleColor: (color: string) => void;
  setGlowColor: (color: string) => void;
  setMatrixRainOpacity: (v: number) => void;
  setBackgroundOpacity: (v: number) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      activeTheme: DEFAULT_THEME_ID,
      accentColor: '#c9a24d',
      glassBlur: 20,
      reduceMotion: false,
      particleDensity: 80,
      particleSpeed: 1,
      particleLifespan: 2,
      particleColor: '',
      glowColor: '',
      matrixRainOpacity: 40,
      backgroundOpacity: 12,
      setActiveTheme: (id) => set({ activeTheme: id }),
      setAccentColor: (color) => set({ accentColor: color }),
      setGlassBlur: (blur) => set({ glassBlur: blur }),
      setReduceMotion: (value) => set({ reduceMotion: value }),
      setParticleDensity: (v) => set({ particleDensity: v }),
      setParticleSpeed: (v) => set({ particleSpeed: v }),
      setParticleLifespan: (v) => set({ particleLifespan: v }),
      setParticleColor: (color) => set({ particleColor: color }),
      setGlowColor: (color) => set({ glowColor: color }),
      setMatrixRainOpacity: (v) => set({ matrixRainOpacity: v }),
      setBackgroundOpacity: (v) => set({ backgroundOpacity: v }),
    }),
    {
      name: 'litebench-theme',
    },
  ),
);
