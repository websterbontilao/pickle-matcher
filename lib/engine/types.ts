import type { Match, SitOut } from "@/lib/schemas";

/** A schedulable group: a linked mutually-active pair collapses into one 2-slot
 * unit; an unlinked active player is a 1-slot unit. Units are the thing the
 * engine actually assigns to teams, so linked pairs never get split up. */
export interface Unit {
  playerIds: string[];
  /** Summed `rankedGames` of the unit's players — real games plus any
   * catch-up credit. */
  rankedGames: number;
  queuePosition: number;
  /** True if any player in the unit is still a newcomer. */
  newcomer: boolean;
}

/** Which band of the queue a unit falls in, front to back. */
export type QueueTier = "newcomer" | "guaranteed" | "normal" | "resting";

export interface RankedUnit extends Unit {
  tier: QueueTier;
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
  /** Set when the match came from a planned match, which the caller must
   * now remove from `plannedMatches`. */
  plannedMatchId?: string;
  /** Where a planned match overrides a fairness rule. Never blocks —
   * surfaced as a warning on the Upcoming tab. */
  ruleConflicts?: RuleConflict[];
}

/** A planned match going against a fairness rule: seating someone due a
 * forced rest while a non-resting player waits, or leaving out someone
 * guaranteed a spot while a non-guaranteed player plays. */
export interface RuleConflict {
  playerId: string;
  rule: "resting" | "guaranteed";
}
