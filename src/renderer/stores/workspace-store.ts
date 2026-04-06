import { create } from 'zustand';

export type PanelType = 'welcome' | 'dashboard' | 'runner' | 'results' | 'tests' | 'settings' | 'agent' | 'browser' | 'agent-benchmark' | 'terminal' | 'arena';

export interface WorkspacePanel {
  id: string;
  type: PanelType;
  title: string;
}

const PANEL_TITLES: Record<PanelType, string> = {
  welcome: 'Welcome',
  dashboard: 'Dashboard',
  runner: 'Run Benchmark',
  results: 'Results',
  tests: 'Test Suites',
  settings: 'Settings',
  agent: 'Agent Chat',
  browser: 'Browser',
  'agent-benchmark': 'Agent Benchmark',
  terminal: 'Terminal',
  arena: 'Battle Arena',
};

// All panel types are singletons in LiteBench
const panelSlotMemory = new Map<PanelType, number>();

function insertAtRememberedSlot(panels: WorkspacePanel[], newPanel: WorkspacePanel): WorkspacePanel[] {
  const remembered = panelSlotMemory.get(newPanel.type);
  panelSlotMemory.delete(newPanel.type);
  if (remembered !== undefined) {
    const index = Math.min(remembered, panels.length);
    const result = [...panels];
    result.splice(index, 0, newPanel);
    return result;
  }
  return [...panels, newPanel];
}

interface WorkspaceState {
  panels: WorkspacePanel[];
  activePanelId: string | null;

  addPanel: (type: PanelType) => void;
  removePanel: (id: string) => void;
  setActivePanel: (id: string) => void;
  reorderPanels: (fromIndex: number, toIndex: number) => void;
  hasPanelType: (type: PanelType) => boolean;
  togglePanelType: (type: PanelType) => void;
}

let panelCounter = 0;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  panels: [
    { id: 'ws-welcome-1', type: 'welcome', title: 'Welcome' },
  ],
  activePanelId: 'ws-welcome-1',

  addPanel: (type: PanelType) => {
    const existing = get().panels.find((p) => p.type === type);
    if (existing) {
      set({ activePanelId: existing.id });
      return;
    }
    const id = `ws-${type}-${++panelCounter}`;
    const newPanel: WorkspacePanel = { id, type, title: PANEL_TITLES[type] };
    set((state) => ({
      panels: insertAtRememberedSlot(state.panels, newPanel),
      activePanelId: id,
    }));
  },

  removePanel: (id: string) => {
    set((state) => {
      const index = state.panels.findIndex((p) => p.id === id);
      if (index !== -1) {
        panelSlotMemory.set(state.panels[index].type, index);
      }
      const panels = state.panels.filter((p) => p.id !== id);
      let activePanelId = state.activePanelId;
      if (activePanelId === id) {
        activePanelId = panels.length > 0 ? panels[panels.length - 1].id : null;
      }
      return { panels, activePanelId };
    });
  },

  setActivePanel: (id: string) => set({ activePanelId: id }),

  reorderPanels: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const panels = [...state.panels];
      const [moved] = panels.splice(fromIndex, 1);
      panels.splice(toIndex, 0, moved);
      return { panels };
    });
  },

  hasPanelType: (type: PanelType) => get().panels.some((p) => p.type === type),

  togglePanelType: (type: PanelType) => {
    const existing = get().panels.find((p) => p.type === type);
    if (existing) {
      get().removePanel(existing.id);
    } else {
      get().addPanel(type);
    }
  },
}));
