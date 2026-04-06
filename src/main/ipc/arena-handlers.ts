import { ipcMain, WebContents } from 'electron';
import type { Battle, BattleEvent, PresetChallenge } from '../../shared/types';
import {
  startBattle,
  cancelBattle,
  recordJudgment,
  type StartBattleConfig,
} from '../engine/battle-orchestrator';
import {
  getBattle,
  getGallery,
  getEloRatings,
  getPresets,
} from '../db/battles-db';

function emitBattleEvent(sender: WebContents, event: BattleEvent): void {
  if (!sender.isDestroyed()) {
    sender.send('bench:arena:event', event);
  }
}

export function registerArenaHandlers(): void {
  // Start a new battle — streams events via sender.send, returns full Battle with competitors
  ipcMain.handle(
    'bench:arena:start-battle',
    async (
      ipcEvent,
      config: StartBattleConfig,
    ): Promise<Battle> => {
      const sender = ipcEvent.sender;

      // Start battle in background — events stream live to renderer
      // We can't await the full battle (it takes minutes), so we return early
      // The battle-orchestrator creates the battle row synchronously then runs async
      // We need the battleId + initial competitors for the store to render panes

      let resolveInitial!: (battle: Battle) => void;
      const initialBattleReady = new Promise<Battle>((resolve) => {
        resolveInitial = resolve;
      });

      // Run the battle asynchronously
      void startBattle(config, (event) => {
        emitBattleEvent(sender, event);

        // On first battle_done (phase: 'building'), the battle row + competitors exist in DB
        if (event.type === 'battle_done' && event.phase === 'building') {
          const battle = getBattle(event.battleId);
          if (battle) resolveInitial(battle);
        }
      }).then((battleId) => {
        // Fallback: if we never got a building event, resolve with whatever is in DB
        const battle = getBattle(battleId);
        if (battle) resolveInitial(battle);
      }).catch((err) => {
        // Propagate error as a battle event
        emitBattleEvent(sender, { type: 'error', message: String(err) });
      });

      // Wait up to 10s for initial battle state, then return what we have
      const timeoutFallback = new Promise<Battle>((_, reject) =>
        setTimeout(() => reject(new Error('Battle start timed out')), 10_000),
      );

      return Promise.race([initialBattleReady, timeoutFallback]);
    },
  );

  // Cancel an active battle
  ipcMain.handle(
    'bench:arena:cancel-battle',
    (_event, battleId: string): { cancelled: boolean } => {
      const cancelled = cancelBattle(battleId);
      return { cancelled };
    },
  );

  // Get gallery (completed/cancelled battles, newest first)
  ipcMain.handle(
    'bench:arena:get-gallery',
    (_event, limit?: number, offset?: number): Battle[] => {
      return getGallery(limit ?? 50, offset ?? 0);
    },
  );

  // Get single battle with competitors + scores
  ipcMain.handle(
    'bench:arena:get-battle',
    (_event, battleId: string): Battle | null => {
      return getBattle(battleId);
    },
  );

  // Get ELO leaderboard
  ipcMain.handle('bench:arena:get-elo', () => {
    return getEloRatings();
  });

  // Get seeded preset challenges
  ipcMain.handle('bench:arena:get-presets', (): PresetChallenge[] => {
    return getPresets();
  });

  // Human picks winner by competitorId
  // Looks up competitor endpoint+model from DB to build model keys for ELO
  ipcMain.handle(
    'bench:arena:judge',
    (
      _event,
      battleId: string,
      winnerId: string,
    ): void => {
      const battle = getBattle(battleId);
      if (!battle) throw new Error(`Battle ${battleId} not found`);

      // Build ordered array: winner first, then rest
      const winner = battle.competitors.find((c) => c.id === winnerId);
      if (!winner) throw new Error(`Competitor ${winnerId} not found in battle ${battleId}`);

      const others = battle.competitors.filter((c) => c.id !== winnerId);
      const orderedIds = [winner.id, ...others.map((c) => c.id)];
      const orderedPairs = [winner, ...others].map((c) => ({
        endpointId: c.endpointId,
        modelId: c.modelId,
      }));

      recordJudgment(battleId, orderedIds, orderedPairs, false);
    },
  );
}
