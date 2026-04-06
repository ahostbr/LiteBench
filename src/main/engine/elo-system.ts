import type { EloRating } from '../../shared/types';
import {
  getEloRating,
  updateElo,
  getEloRatings,
  incrementBattleCount,
  applyEloDelta,
} from '../db/battles-db';

const K_FACTOR = 32;

export interface EloUpdateResult {
  winnerKey: string;
  loserKey: string;
  winnerDelta: number;
  loserDelta: number;
  winnerNewRating: number;
  loserNewRating: number;
  isDraw: boolean;
}

/**
 * Compute ELO delta without persisting.
 * Useful for previewing ELO changes in the UI before confirming.
 */
export function computeEloDelta(
  winnerRating: number,
  loserRating: number,
  isDraw = false,
): { winnerDelta: number; loserDelta: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const actualWinner = isDraw ? 0.5 : 1;
  const actualLoser = isDraw ? 0.5 : 0;

  const winnerDelta = Math.round(K_FACTOR * (actualWinner - expectedWinner));
  const loserDelta = Math.round(K_FACTOR * (actualLoser - expectedLoser));

  return { winnerDelta, loserDelta };
}

/**
 * Update ELO for a single winner/loser pair and return the deltas.
 * Persists to the database.
 */
export function applyEloUpdate(
  winnerKey: string,
  loserKey: string,
  isDraw = false,
): EloUpdateResult {
  const winnerBefore = getEloRating(winnerKey);
  const loserBefore = getEloRating(loserKey);

  const { winnerDelta, loserDelta } = updateElo(winnerKey, loserKey, isDraw);

  return {
    winnerKey,
    loserKey,
    winnerDelta,
    loserDelta,
    winnerNewRating: Math.round(winnerBefore.rating + winnerDelta),
    loserNewRating: Math.round(loserBefore.rating + loserDelta),
    isDraw,
  };
}

/**
 * Handle a multi-competitor battle result via round-robin pairwise ELO.
 *
 * Snapshots all ratings at the start so pairwise expected-score calculations
 * use the same baseline (matches previewEloDeltas behavior). Only writes
 * accumulated deltas to the DB once at the end.
 *
 * competitorKeys is ordered by placement (index 0 = 1st, index 1 = 2nd, etc.).
 * Winner (index 0) plays against all others. Adjacent pairs play each other.
 *
 * For a 2-competitor battle: just one matchup.
 * For N competitors: winner vs all, plus adjacent-pair matchups.
 */
export function applyMultiCompetitorElo(
  competitorKeys: string[],
  isDraw = false,
): EloUpdateResult[] {
  if (competitorKeys.length < 2) return [];

  // Snapshot all ratings BEFORE any computation
  const snapshot = new Map<string, number>();
  for (const key of competitorKeys) {
    snapshot.set(key, getEloRating(key).rating);
  }

  // Accumulate deltas per model key
  const deltaMap = new Map<string, number>();
  const winsMap = new Map<string, number>();
  const lossesMap = new Map<string, number>();
  const drawsMap = new Map<string, number>();
  for (const key of competitorKeys) {
    deltaMap.set(key, 0);
    winsMap.set(key, 0);
    lossesMap.set(key, 0);
    drawsMap.set(key, 0);
  }

  const results: EloUpdateResult[] = [];

  const addPair = (winnerKey: string, loserKey: string, pairIsDraw: boolean) => {
    const winnerRating = snapshot.get(winnerKey)!;
    const loserRating = snapshot.get(loserKey)!;
    const { winnerDelta, loserDelta } = computeEloDelta(winnerRating, loserRating, pairIsDraw);

    deltaMap.set(winnerKey, (deltaMap.get(winnerKey) ?? 0) + winnerDelta);
    deltaMap.set(loserKey, (deltaMap.get(loserKey) ?? 0) + loserDelta);

    if (pairIsDraw) {
      drawsMap.set(winnerKey, (drawsMap.get(winnerKey) ?? 0) + 1);
      drawsMap.set(loserKey, (drawsMap.get(loserKey) ?? 0) + 1);
    } else {
      winsMap.set(winnerKey, (winsMap.get(winnerKey) ?? 0) + 1);
      lossesMap.set(loserKey, (lossesMap.get(loserKey) ?? 0) + 1);
    }

    results.push({
      winnerKey,
      loserKey,
      winnerDelta,
      loserDelta,
      winnerNewRating: Math.round(winnerRating + winnerDelta),
      loserNewRating: Math.round(loserRating + loserDelta),
      isDraw: pairIsDraw,
    });
  };

  if (isDraw) {
    // All competitors draw with each other — pairwise
    for (let i = 0; i < competitorKeys.length; i++) {
      for (let j = i + 1; j < competitorKeys.length; j++) {
        addPair(competitorKeys[i], competitorKeys[j], true);
      }
    }
  } else {
    // Non-draw: winner (index 0) beats everyone
    const winner = competitorKeys[0];
    for (let i = 1; i < competitorKeys.length; i++) {
      addPair(winner, competitorKeys[i], false);
    }

    // Adjacent pairs: 2nd vs 3rd, 3rd vs 4th, etc.
    for (let i = 1; i < competitorKeys.length - 1; i++) {
      addPair(competitorKeys[i], competitorKeys[i + 1], false);
    }
  }

  // Write accumulated deltas to DB in one pass (one write per model, battle_count +1)
  const uniqueKeys = new Set(competitorKeys);
  for (const key of uniqueKeys) {
    applyEloDelta(key, deltaMap.get(key) ?? 0, {
      wins: winsMap.get(key) ?? 0,
      losses: lossesMap.get(key) ?? 0,
      draws: drawsMap.get(key) ?? 0,
    });
  }

  return results;
}

/**
 * Get the full ELO leaderboard, sorted by rating descending.
 */
export function getLeaderboard(): EloRating[] {
  return getEloRatings();
}

/**
 * Build a model key from endpoint ID + model ID.
 * This is the unique identifier used in the ELO table.
 */
export function makeModelKey(endpointId: number, modelId: string): string {
  return `${endpointId}:${modelId}`;
}

/**
 * Preview ELO deltas for a potential battle result without persisting.
 * Useful for showing "+18 / -18" in the judging panel before confirming.
 */
export function previewEloDeltas(
  competitorKeys: string[],
): { key: string; currentRating: number; delta: number }[] {
  if (competitorKeys.length < 2) return [];

  const ratings = competitorKeys.map((key) => ({
    key,
    rating: getEloRating(key).rating,
  }));

  // Simulate winner vs all
  const winner = ratings[0];
  const deltaMap = new Map<string, number>();
  deltaMap.set(winner.key, 0);

  for (let i = 1; i < ratings.length; i++) {
    const loser = ratings[i];
    const { winnerDelta, loserDelta } = computeEloDelta(winner.rating, loser.rating);
    deltaMap.set(winner.key, (deltaMap.get(winner.key) ?? 0) + winnerDelta);
    deltaMap.set(loser.key, (deltaMap.get(loser.key) ?? 0) + loserDelta);
  }

  // Adjacent pairs
  for (let i = 1; i < ratings.length - 1; i++) {
    const higher = ratings[i];
    const lower = ratings[i + 1];
    const { winnerDelta, loserDelta } = computeEloDelta(higher.rating, lower.rating);
    deltaMap.set(higher.key, (deltaMap.get(higher.key) ?? 0) + winnerDelta);
    deltaMap.set(lower.key, (deltaMap.get(lower.key) ?? 0) + loserDelta);
  }

  return ratings.map((r) => ({
    key: r.key,
    currentRating: r.rating,
    delta: deltaMap.get(r.key) ?? 0,
  }));
}
