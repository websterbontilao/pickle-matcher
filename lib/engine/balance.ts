import type { Player } from "@/lib/schemas";

/** Team splits whose average-rating gap is within this of the fairest
 * split count as equally fair, so partner/opponent variety can choose
 * among them instead of the same balanced pairs always teaming up. */
export const BALANCE_TOLERANCE = 0.25;

/** A rating gap at or above this between the two sides is an uneven match. */
export const UNEVEN_THRESHOLD = 0.5;

/** Floating-point slack for comparing averages like 2.75 vs 2.25. */
const EPSILON = 1e-9;

export type RatingOf = (playerId: string) => number;

export function ratingLookup(players: Player[]): RatingOf {
  const byId = new Map(players.map((p) => [p.id, p.skillRating]));
  return (id) => byId.get(id) ?? 0;
}

export function teamRating(ids: string[], ratingOf: RatingOf): number {
  return ids.length === 0 ? 0 : ids.reduce((sum, id) => sum + ratingOf(id), 0) / ids.length;
}

export function ratingGap(teamA: string[], teamB: string[], ratingOf: RatingOf): number {
  return Math.abs(teamRating(teamA, ratingOf) - teamRating(teamB, ratingOf));
}

export function withinTolerance(gap: number, bestGap: number): boolean {
  return gap <= bestGap + BALANCE_TOLERANCE + EPSILON;
}

/** Each side's average rating when the match is uneven (gap of at least
 * UNEVEN_THRESHOLD — in singles, simply the two players' ratings), or null
 * when it's fair enough. Applies however the match came about. */
export function unevenTeams(
  match: { teamA: string[]; teamB: string[] },
  ratingOf: RatingOf,
): { teamA: number; teamB: number } | null {
  const teamA = teamRating(match.teamA, ratingOf);
  const teamB = teamRating(match.teamB, ratingOf);
  return Math.abs(teamA - teamB) >= UNEVEN_THRESHOLD - EPSILON ? { teamA, teamB } : null;
}

export type ImbalanceCause =
  /** One player rated far from everyone else in the match. */
  | { kind: "above" | "below"; playerIds: string[] }
  /** The strongest players ended up on the same team. */
  | { kind: "stacked"; playerIds: string[] }
  /** A strong player on one side and a weak one on the other pull apart. */
  | { kind: "spread"; strongIds: string[]; weakIds: string[] }
  /** Singles: just the two players. */
  | { kind: "singles"; playerIds: string[] };

/** Who's driving an uneven match, so the organizer knows who to swap: the
 * player(s) whose rating strays furthest from the match average. A lone
 * outlier is rated well above or below the rest; if it's the whole
 * stronger team, they're stacked; otherwise it's a strong player on one
 * side against a weak one on the other. */
export function imbalanceCause(match: { teamA: string[]; teamB: string[] }, ratingOf: RatingOf): ImbalanceCause {
  const all = [...match.teamA, ...match.teamB];
  if (all.length <= 2) return { kind: "singles", playerIds: all };

  const mean = teamRating(all, ratingOf);
  const deviation = (id: string) => Math.abs(ratingOf(id) - mean);
  const maxDeviation = Math.max(...all.map(deviation));
  const outliers = all.filter((id) => deviation(id) >= maxDeviation - EPSILON);
  const strongIds = outliers.filter((id) => ratingOf(id) > mean);
  const weakIds = outliers.filter((id) => ratingOf(id) < mean);

  if (outliers.length === 1) return { kind: strongIds.length === 1 ? "above" : "below", playerIds: outliers };

  const strongerTeam = teamRating(match.teamA, ratingOf) >= teamRating(match.teamB, ratingOf) ? match.teamA : match.teamB;
  if (strongerTeam.every((id) => strongIds.includes(id))) return { kind: "stacked", playerIds: strongerTeam };
  if (strongIds.length > 0 && weakIds.length > 0) return { kind: "spread", strongIds, weakIds };
  return { kind: strongIds.length > 0 ? "above" : "below", playerIds: outliers };
}
