import type { Player, SitOut } from "@/lib/schemas";

export const REST_REASON = "Resting after consecutive games";
export const WAITING_REASON = "Waiting for a court to free up";

/**
 * Both the forced-rest and forced-play streak thresholds share this value:
 * once a player has missed (or played) one full natural rotation's worth of
 * cycles, the guarantee/override kicks in. `slots` is how many players play
 * per cycle across every court (courtCount × playersPerMatch); a full
 * rotation covering every active player takes `ceil(activePlayerCount /
 * slots)` cycles, so the threshold is that minus one — clamped to at least 1
 * so the guarantee is never immediate. This scales the same fixed-at-2
 * behavior that worked for the original 12-players/1-doubles-court baseline
 * to any player/court combination, instead of over- or under-firing when
 * the pool is much larger or smaller relative to court capacity.
 */
export function computeStreakThreshold(activePlayerCount: number, courtCount: number, playersPerMatch: number): number {
  const slots = Math.max(1, courtCount) * playersPerMatch;
  return Math.max(1, Math.ceil(activePlayerCount / slots) - 1);
}

export function isForcedRest(player: Player, threshold: number): boolean {
  return player.consecutiveGames >= threshold;
}

export function isForcedPlay(player: Player, threshold: number): boolean {
  return player.consecutiveSitOuts >= threshold;
}

/** The games count used for queue ranking: real games played plus any
 * catch-up credit a late joiner was given after their first match. Never
 * use this for displayed stats. */
export function rankedGames(player: Player): number {
  return player.gamesPlayed + player.gamesCredit;
}

export function buildSitOut(player: Player, round: number, reason: string): SitOut {
  return { round, playerId: player.id, reason };
}
