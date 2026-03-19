import { create } from 'zustand';

export type LayoutMode = 'grid' | 'splitter' | 'tabs' | 'window';

interface LayoutState {
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  layoutMode: 'tabs',
  setLayoutMode: (mode) => set({ layoutMode: mode }),
}));
