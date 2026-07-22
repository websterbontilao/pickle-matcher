import type { Match, Player } from "@/lib/schemas";

export function winRate(player: Pick<Player, "gamesPlayed" | "wins">): string {
  if (player.gamesPlayed === 0) return "—";
  return `${Math.round((player.wins / player.gamesPlayed) * 100)}%`;
}

/** Combined win-loss record — gamesPlayed is always wins+losses in this
 * app, so a single "W-L" figure covers all three fields without repeating
 * the total. */
export function record(player: Pick<Player, "wins" | "losses">): string {
  return `${player.wins}-${player.losses}`;
}

/** Sum of (decided match's timestamp - startedAt) across every match this
 * player has actually played and finished. Derived from match history
 * rather than a running counter, so undo/change-result never need to keep
 * a separate total in sync. */
export function totalPlayTimeMs(playerId: string, matches: Match[]): number {
  return matches.reduce((sum, m) => {
    if (m.winner === null || m.startedAt === null) return sum;
    if (!m.teamA.includes(playerId) && !m.teamB.includes(playerId)) return sum;
    return sum + (m.timestamp - m.startedAt);
  }, 0);
}
