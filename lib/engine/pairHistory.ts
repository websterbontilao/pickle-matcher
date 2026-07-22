import type { Match } from "@/lib/schemas";
import { pairKey } from "./pairKey";

export interface PairHistory {
  /** Count of rounds two players have been on the same team together. */
  partnerCount: Map<string, number>;
  /** Count of rounds two players have been on opposing teams. */
  opponentCount: Map<string, number>;
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Derived from `matches` on every call — not persisted separately, so it
 * can never drift out of sync with the match log. */
export function buildPairHistory(matches: Match[]): PairHistory {
  const partnerCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();

  for (const match of matches) {
    for (let i = 0; i < match.teamA.length; i++) {
      for (let j = i + 1; j < match.teamA.length; j++) {
        increment(partnerCount, pairKey(match.teamA[i], match.teamA[j]));
      }
    }
    for (let i = 0; i < match.teamB.length; i++) {
      for (let j = i + 1; j < match.teamB.length; j++) {
        increment(partnerCount, pairKey(match.teamB[i], match.teamB[j]));
      }
    }
    for (const a of match.teamA) {
      for (const b of match.teamB) {
        increment(opponentCount, pairKey(a, b));
      }
    }
  }

  return { partnerCount, opponentCount };
}
