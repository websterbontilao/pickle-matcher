import type { Match, Player } from "@/lib/schemas";
import { totalPlayTimeMs } from "./stats";

export type PlayerSortKey = "name" | "games" | "record" | "winRate" | "time" | "added";
export type SortDirection = "asc" | "desc";

export interface PlayerSort {
  key: PlayerSortKey;
  direction: SortDirection;
}

/** Join order — how the list has always been shown. */
export const DEFAULT_PLAYER_SORT: PlayerSort = { key: "added", direction: "asc" };

/** The direction a column sorts in when first picked: names and join time
 * read naturally A→Z / earliest first, numbers most-first. */
export function defaultDirection(key: PlayerSortKey): SortDirection {
  return key === "name" || key === "added" ? "asc" : "desc";
}

/**
 * Players list order for a column sort. Players who left the session
 * always sit below active ones. Record sorts by wins, then fewer losses;
 * win % puts players with no games below everyone in either direction.
 * Ties fall back to join order so the list never jumps around.
 */
export function sortPlayers(players: Player[], sort: PlayerSort, matches: Match[]): Player[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const playTime = new Map(players.map((p) => [p.id, totalPlayTimeMs(p.id, matches)]));

  const compare = (a: Player, b: Player): number => {
    switch (sort.key) {
      case "name":
        return sign * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "games":
        return sign * (a.gamesPlayed - b.gamesPlayed);
      case "record":
        return sign * (a.wins - b.wins || b.losses - a.losses);
      case "winRate": {
        if (a.gamesPlayed === 0 || b.gamesPlayed === 0) return (a.gamesPlayed === 0 ? 1 : 0) - (b.gamesPlayed === 0 ? 1 : 0);
        return sign * (a.wins / a.gamesPlayed - b.wins / b.gamesPlayed);
      }
      case "time":
        return sign * (playTime.get(a.id)! - playTime.get(b.id)!);
      case "added":
        return sign * (a.joinedAt - b.joinedAt);
    }
  };

  return [...players].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return compare(a, b) || a.joinedAt - b.joinedAt;
  });
}
