import { describe, expect, it } from "vitest";
import { totalPlayTimeMs } from "@/lib/utils/stats";
import type { Match } from "@/lib/schemas";

function match(overrides: Partial<Match>): Match {
  return {
    id: "m",
    roundNumber: 1,
    courtId: "c1",
    teamA: [],
    teamB: [],
    winner: null,
    startedAt: null,
    timestamp: 0,
    ...overrides,
  };
}

describe("totalPlayTimeMs", () => {
  it("sums elapsed time only across decided matches the player actually appeared in", () => {
    const matches: Match[] = [
      match({ teamA: ["p1", "p2"], teamB: ["p3", "p4"], winner: "A", startedAt: 0, timestamp: 60_000 }),
      match({ teamA: ["p1", "p3"], teamB: ["p2", "p4"], winner: "B", startedAt: 100_000, timestamp: 130_000 }),
      // Not decided yet — shouldn't count even though p1 is in it.
      match({ teamA: ["p1", "p2"], teamB: ["p3", "p4"], winner: null, startedAt: 200_000, timestamp: 200_000 }),
      // Doesn't involve p1 at all.
      match({ teamA: ["p2", "p3"], teamB: ["p4", "p5"], winner: "A", startedAt: 0, timestamp: 999_000 }),
    ];

    expect(totalPlayTimeMs("p1", matches)).toBe(60_000 + 30_000);
  });

  it("returns 0 for a player with no decided matches", () => {
    expect(totalPlayTimeMs("ghost", [])).toBe(0);
  });
});
