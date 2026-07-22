import type { Player, SitOut } from "@/lib/schemas";

/** Once a player has played this many games in a row with no rest, they're
 * excluded from selection for one cycle even if they'd otherwise have top
 * priority (fewest games played) — so a late joiner doesn't play 4+ rounds
 * straight while everyone else waits. */
export const REST_STREAK_THRESHOLD = 2;

export const REST_REASON = "Resting after 2 consecutive games";
export const WAITING_REASON = "Waiting for a court to free up";

/** Once a player has sat out this many cycles in a row, they're guaranteed
 * a spot in the next selection — even overriding a tie-break that would
 * otherwise pass them over again — so nobody gets stuck watching
 * indefinitely while ties keep favoring the same other players. */
export const SIT_OUT_STREAK_THRESHOLD = 2;

export function isForcedRest(player: Player): boolean {
  return player.consecutiveGames >= REST_STREAK_THRESHOLD;
}

export function isForcedPlay(player: Player): boolean {
  return player.consecutiveSitOuts >= SIT_OUT_STREAK_THRESHOLD;
}

/** Fewest games played first, then whoever joined earliest, then a
 * deterministic id-based tie-break so results are reproducible. */
export function sortPlayersByPriority(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.id.localeCompare(b.id);
  });
}

export function buildSitOut(player: Player, round: number, reason: string): SitOut {
  return { round, playerId: player.id, reason };
}
