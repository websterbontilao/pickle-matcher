import { describe, expect, it } from "vitest";
import { formBestDoublesSplit } from "@/lib/engine/pairing";
import { buildPairHistory } from "@/lib/engine/pairHistory";
import type { Unit } from "@/lib/engine/types";
import type { Match } from "@/lib/schemas";

function unit(...playerIds: string[]): Unit {
  return { playerIds, gamesPlayed: 0, joinedAt: 0 };
}

describe("formBestDoublesSplit", () => {
  it("with no history, still produces a valid 2v2 split of four singles", () => {
    const units = [unit("a"), unit("b"), unit("c"), unit("d")];
    const history = buildPairHistory([]);

    const { teamA, teamB } = formBestDoublesSplit(units, history);

    expect(teamA).toHaveLength(2);
    expect(teamB).toHaveLength(2);
    expect([...teamA, ...teamB].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("avoids repeating the exact same partner+opponent split from history", () => {
    const priorMatch: Match = {
      id: "m1",
      roundNumber: 1,
      courtId: "c1",
      teamA: ["a", "b"],
      teamB: ["c", "d"],
      winner: "A",
      startedAt: 1,
      timestamp: 2,
    };
    const history = buildPairHistory([priorMatch]);
    const units = [unit("a"), unit("b"), unit("c"), unit("d")];

    const { teamA, teamB } = formBestDoublesSplit(units, history);

    const a = teamA.slice().sort();
    const b = teamB.slice().sort();
    const repeats = (a.join() === "a,b" && b.join() === "c,d") || (a.join() === "c,d" && b.join() === "a,b");
    expect(repeats).toBe(false);
  });

  it("keeps a linked (2-slot) unit whole on one side regardless of history", () => {
    const linkedPair = unit("a", "b");
    const units = [linkedPair, unit("c"), unit("d")];
    const history = buildPairHistory([]);

    const { teamA, teamB } = formBestDoublesSplit(units, history);

    const linkedTeam = teamA.includes("a") ? teamA : teamB;
    expect(linkedTeam.slice().sort()).toEqual(["a", "b"]);
  });

  it("has only one valid arrangement for two linked pairs, regardless of history", () => {
    const units = [unit("a", "b"), unit("c", "d")];
    const history = buildPairHistory([]);

    const { teamA, teamB } = formBestDoublesSplit(units, history);

    expect([teamA.slice().sort(), teamB.slice().sort()].sort()).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});
