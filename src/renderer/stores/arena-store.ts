import { create } from 'zustand';
import { api } from '@/api/client';
import type {
  Battle,
  BattleEvent,
  BattlePhase,
  EloRating,
  PresetChallenge,
  CompetitorStatus,
  MetricResult,
} from '../../shared/types';

interface CompetitorState {
  status: CompetitorStatus;
  terminalLog: string;
  filesWritten: string[];
  previewUrl?: string;
  metrics?: MetricResult[];
}

interface ArenaState {
  // Battle config
  selectedModels: { endpointId: number; modelId: string }[];
  prompt: string;
  presetId: string | null;

  // Active battle
  activeBattle: Battle | null;
  competitorStates: Map<string, CompetitorState>;
  phase: BattlePhase;

  // Gallery + ELO
  gallery: Battle[];
  eloLeaderboard: EloRating[];
  presets: PresetChallenge[];

  // Pending winner pick (before ELO confirm)
  pendingWinnerId: string | null;

  // Error state
  error: string | null;

  // Actions
  addModel(endpointId: number, modelId: string): void;
  removeModel(index: number): void;
  setPrompt(prompt: string): void;
  selectPreset(preset: PresetChallenge): void;
  startBattle(): Promise<void>;
  cancelBattle(): Promise<void>;
  pickWinner(competitorId: string): void;
  confirmWinner(): Promise<void>;
  loadGallery(): Promise<void>;
  loadElo(): Promise<void>;
  loadPresets(): Promise<void>;
  resetToConfig(): void;
  _handleBattleEvent(event: BattleEvent): void;
}

export const useArenaStore = create<ArenaState>((set, get) => ({
  selectedModels: [],
  prompt: '',
  presetId: null,
  activeBattle: null,
  competitorStates: new Map(),
  phase: 'configuring',
  gallery: [],
  eloLeaderboard: [],
  presets: [],
  pendingWinnerId: null,
  error: null,

  addModel(endpointId, modelId) {
    set((s) => ({
      selectedModels: [...s.selectedModels, { endpointId, modelId }],
    }));
  },

  removeModel(index) {
    set((s) => ({
      selectedModels: s.selectedModels.filter((_, i) => i !== index),
    }));
  },

  setPrompt(prompt) {
    set({ prompt });
  },

  selectPreset(preset) {
    set({ prompt: preset.description, presetId: preset.id });
  },

  async startBattle() {
    const { selectedModels, prompt, presetId } = get();
    if (selectedModels.length < 2) return;

    set({ error: null, phase: 'building', competitorStates: new Map() });

    try {
      const battle = await api.arena.startBattle({
        prompt,
        competitors: selectedModels,
        presetId: presetId ?? undefined,
      });

      const initialStates = new Map<string, CompetitorState>();
      for (const competitor of battle.competitors) {
        initialStates.set(competitor.id, {
          status: 'pending',
          terminalLog: '',
          filesWritten: [],
        });
      }

      set({ activeBattle: battle, competitorStates: initialStates });

      // Register event listener
      api.arena.onEvent((event: BattleEvent) => {
        get()._handleBattleEvent(event);
      });
    } catch (err) {
      set({ error: String(err), phase: 'configuring' });
    }
  },

  async cancelBattle() {
    const { activeBattle } = get();
    if (!activeBattle) return;
    try {
      await api.arena.cancelBattle(activeBattle.id);
    } catch {
      // Ignore cancel errors — reset state regardless
    }
    set({ activeBattle: null, phase: 'configuring', competitorStates: new Map() });
  },

  pickWinner(competitorId) {
    set({ pendingWinnerId: competitorId });
  },

  async confirmWinner() {
    const { activeBattle, pendingWinnerId } = get();
    if (!activeBattle || !pendingWinnerId) return;

    try {
      await api.arena.judge(activeBattle.id, pendingWinnerId);
      set((s) => ({
        activeBattle: s.activeBattle
          ? { ...s.activeBattle, winnerId: pendingWinnerId, phase: 'results' }
          : null,
        phase: 'results',
        pendingWinnerId: null,
      }));
      // Refresh ELO after judging
      get().loadElo();
      get().loadGallery();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async loadGallery() {
    try {
      const gallery = await api.arena.getGallery();
      set({ gallery });
    } catch {
      // Non-fatal
    }
  },

  async loadElo() {
    try {
      const eloLeaderboard = await api.arena.getElo();
      set({ eloLeaderboard });
    } catch {
      // Non-fatal
    }
  },

  async loadPresets() {
    try {
      const presets = await api.arena.getPresets();
      set({ presets });
    } catch {
      // Non-fatal
    }
  },

  resetToConfig() {
    set({
      activeBattle: null,
      phase: 'configuring',
      competitorStates: new Map(),
      pendingWinnerId: null,
      error: null,
    });
  },

  _handleBattleEvent(event) {
    set((s) => {
      const states = new Map(s.competitorStates);

      switch (event.type) {
        case 'competitor_start': {
          const existing = states.get(event.competitorId) ?? {
            status: 'pending' as CompetitorStatus,
            terminalLog: '',
            filesWritten: [],
          };
          states.set(event.competitorId, { ...existing, status: 'running' });
          break;
        }

        case 'text_delta': {
          const existing = states.get(event.competitorId);
          if (existing) {
            states.set(event.competitorId, {
              ...existing,
              terminalLog: existing.terminalLog + event.content,
            });
          }
          break;
        }

        case 'tool_call': {
          const existing = states.get(event.competitorId);
          if (existing) {
            const line = `\n[tool: ${event.toolCall.name}]\n`;
            states.set(event.competitorId, {
              ...existing,
              terminalLog: existing.terminalLog + line,
            });
          }
          break;
        }

        case 'file_written': {
          const existing = states.get(event.competitorId);
          if (existing) {
            const isHtml = event.filename.endsWith('.html');
            states.set(event.competitorId, {
              ...existing,
              filesWritten: [...existing.filesWritten, event.filename],
              previewUrl: isHtml && !existing.previewUrl ? `file://${event.path}` : existing.previewUrl,
            });
          }
          break;
        }

        case 'competitor_done': {
          const existing = states.get(event.competitorId);
          if (existing) {
            states.set(event.competitorId, { ...existing, status: event.status });
          }
          break;
        }

        case 'metrics_ready': {
          const existing = states.get(event.competitorId);
          if (existing) {
            states.set(event.competitorId, { ...existing, metrics: event.metrics });
          }
          break;
        }

        case 'battle_done': {
          return {
            ...s,
            competitorStates: states,
            phase: event.phase,
            activeBattle: s.activeBattle
              ? { ...s.activeBattle, phase: event.phase }
              : null,
          };
        }

        case 'error': {
          if (event.competitorId) {
            const existing = states.get(event.competitorId);
            if (existing) {
              states.set(event.competitorId, {
                ...existing,
                status: 'failed',
                terminalLog: existing.terminalLog + `\n[ERROR] ${event.message}\n`,
              });
            }
          }
          return { ...s, competitorStates: states, error: event.message };
        }
      }

      return { ...s, competitorStates: states };
    });
  },
}));
