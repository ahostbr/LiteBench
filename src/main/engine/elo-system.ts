import type { EloRating } from '../../shared/types';
import {
  getEloRating,
  updateElo,
  getEloRatings,
  incrementBattleCount,
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
 * Same as applyEloUpdate but skips battle_count increment.
 * Used by applyMultiCompetitorElo which does a single increment per model at the end.
 */
function applyEloUpdateNoBattleCount(
  winnerKey: string,
  loserKey: string,
  isDraw = false,
): EloUpdateResult {
  const winnerBefore = getEloRating(winnerKey);
  const loserBefore = getEloRating(loserKey);

  const { winnerDelta, loserDelta } = updateElo(winnerKey, loserKey, isDraw, false);

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
 * competitorKeys is ordered by placement (index 0 = 1st, index 1 = 2nd, etc.).
 * Winner (index 0) plays against all others. Adjacent pairs play each other.
 * This avoids excessive ELO swings from a single battle.
 *
 * For a 2-competitor battle: just one matchup.
 * For N competitors: winner vs all, plus adjacent-pair matchups.
 */
export function applyMultiCompetitorElo(
  competitorKeys: string[],
  isDraw = false,
): EloUpdateResult[] {
  if (competitorKeys.length < 2) return [];

  const results: EloUpdateResult[] = [];

  if (isDraw) {
    // All competitors draw with each other — pairwise (skip per-pair battle_count)
    for (let i = 0; i < competitorKeys.length; i++) {
      for (let j = i + 1; j < competitorKeys.length; j++) {
        const result = applyEloUpdateNoBattleCount(competitorKeys[i], competitorKeys[j], true);
        results.push(result);
      }
    }
    // Increment battle_count once per model
    for (const key of competitorKeys) {
      incrementBattleCount(key);
    }
    return results;
  }

  // Non-draw: winner (index 0) beats everyone (skip per-pair battle_count)
  const winner = competitorKeys[0];
  for (let i = 1; i < competitorKeys.length; i++) {
    const result = applyEloUpdateNoBattleCount(winner, competitorKeys[i]);
    results.push(result);
  }

  // Adjacent pairs: 2nd vs 3rd, 3rd vs 4th, etc.
  for (let i = 1; i < competitorKeys.length - 1; i++) {
    const result = applyEloUpdateNoBattleCount(competitorKeys[i], competitorKeys[i + 1]);
    results.push(result);
  }

  // Increment battle_count once per unique model
  const uniqueKeys = new Set(competitorKeys);
  for (const key of uniqueKeys) {
    incrementBattleCount(key);
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
