import { pairKey } from "./pairKey";
import type { Unit } from "./types";
import type { PairHistory } from "./pairHistory";

export function flattenTeam(team: Unit[]): string[] {
  return team.flatMap((u) => u.playerIds);
}

/** Summed opponent-count between two flattened teams — lower is better
 * (fewer repeat matchups). */
export function opponentScore(teamA: string[], teamB: string[], history: PairHistory): number {
  let total = 0;
  for (const a of teamA) {
    for (const b of teamB) {
      total += history.opponentCount.get(pairKey(a, b)) ?? 0;
    }
  }
  return total;
}

function partnerScore(teamIds: string[], history: PairHistory): number {
  if (teamIds.length < 2) return 0;
  return history.partnerCount.get(pairKey(teamIds[0], teamIds[1])) ?? 0;
}

/** Every way to split exactly 4 slots' worth of units into two 2-person
 * teams, respecting that a linked (2-slot) unit must stay whole on one
 * side. With four lone (1-slot) units there are 3 valid splits — anything
 * else (a linked pair plus two singles, or two linked pairs) has only one
 * possible arrangement, since a 2-slot unit already fills an entire side. */
function enumerateSplits(units: Unit[]): { teamA: Unit[]; teamB: Unit[] }[] {
  if (units.length <= 2) {
    // Either one unit per side (two linked pairs), or too few units to
    // consider — either way there's exactly one arrangement.
    return [{ teamA: [units[0]], teamB: units.slice(1) }];
  }
  if (units.length === 3) {
    // One linked pair + two lone units: the pair fills one whole side, the
    // two singles fill the other — no alternative grouping is possible.
    const pair = units.find((u) => u.playerIds.length === 2);
    if (pair) {
      const singles = units.filter((u) => u !== pair);
      return [{ teamA: [pair], teamB: singles }];
    }
    // Three lone units shouldn't occur for a 4-slot target, but stay safe.
    return [{ teamA: units.slice(0, 1), teamB: units.slice(1) }];
  }
  // Four lone units: three ways to pair them into two teams of two.
  const [a, b, c, d] = units;
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
}

/**
 * Chooses how to split 4 selected units into teamA/teamB by scrambling
 * against history: among every structurally-valid split (linked pairs
 * always kept whole), picks whichever minimizes repeat partnerships
 * (same two people teamed up again) plus repeat matchups (these two teams
 * facing each other again). This is what makes unlinked players actually
 * get reshuffled with fresh partners/opponents over time instead of
 * settling into the same groupings.
 */
export function formBestDoublesSplit(units: Unit[], history: PairHistory): { teamA: string[]; teamB: string[] } {
  const splits = enumerateSplits(units);

  let best = splits[0];
  let bestScore = Infinity;
  for (const split of splits) {
    const teamAIds = flattenTeam(split.teamA);
    const teamBIds = flattenTeam(split.teamB);
    const score = partnerScore(teamAIds, history) + partnerScore(teamBIds, history) + opponentScore(teamAIds, teamBIds, history);
    if (score < bestScore) {
      bestScore = score;
      best = split;
    }
  }

  return { teamA: flattenTeam(best.teamA), teamB: flattenTeam(best.teamB) };
}
