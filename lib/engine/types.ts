import type { Match, SitOut } from "@/lib/schemas";

/** A schedulable group: a linked mutually-active pair collapses into one 2-slot
 * unit; an unlinked active player is a 1-slot unit. Units are the thing the
 * engine actually assigns to teams, so linked pairs never get split up. */
export interface Unit {
  playerIds: string[];
  gamesPlayed: number;
  joinedAt: number;
}

export interface MatchGenerationResult {
  /** null when there currently aren't enough free players for this court —
   * it stays empty until enough players free up elsewhere. */
  match: Match | null;
  /** New sit-out log entries for players who were eligible this cycle but
   * didn't make the cut (forced rest or just waiting for a court). */
  restedSitOuts: SitOut[];
  /** Player ids whose consecutiveGames streak should reset to 0 because
   * they're sitting this cycle out. */
  restedPlayerIds: string[];
}
