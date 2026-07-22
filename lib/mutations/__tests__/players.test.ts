import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, type Player, type SessionState } from "@/lib/schemas";
import { addPlayers, linkPlayers, removePlayer } from "@/lib/mutations/players";
import { busyPlayerIds, fillOpenCourts } from "@/lib/mutations/rounds";

let idCounter = 0;
function makePlayer(overrides: Partial<Player> = {}): Player {
  idCounter += 1;
  return {
    id: overrides.id ?? `p${idCounter}`,
    name: overrides.name ?? `Player ${idCounter}`,
    active: true,
    joinedAt: idCounter,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    consecutiveGames: 0,
    consecutiveSitOuts: 0,
    ...overrides,
  };
}

function baseState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    ...EMPTY_SESSION_STATE,
    courts: [
      { id: "c1", name: "Court 1" },
      { id: "c2", name: "Court 2" },
    ],
    settings: { format: "doubles", courtCount: 2 },
    sessionStarted: true,
    ...overrides,
  };
}

describe("removePlayer", () => {
  it("soft-deletes a currently-waiting (non-busy) player without touching any match", () => {
    const players = Array.from({ length: 9 }, () => makePlayer());
    let state = baseState({ players });
    state = fillOpenCourts(state);
    const matchesBeforeRemoval = state.matches;
    const busy = busyPlayerIds(state);

    const target = players.find((p) => !busy.has(p.id))!;
    state = removePlayer(state, { id: target.id });

    expect(state.players.find((p) => p.id === target.id)?.active).toBe(false);
    expect(state.matches).toEqual(matchesBeforeRemoval);
    // Player record itself is preserved, not deleted.
    expect(state.players.some((p) => p.id === target.id)).toBe(true);
  });

  it("no-ops while the player is currently seated in an undecided match", () => {
    const players = Array.from({ length: 9 }, () => makePlayer());
    let state = baseState({ players });
    state = fillOpenCourts(state);
    const busy = busyPlayerIds(state);
    const target = players.find((p) => busy.has(p.id))!;

    const result = removePlayer(state, { id: target.id });

    expect(result).toBe(state);
  });
});

describe("addPlayers", () => {
  it("adds one player per non-empty line, each with a distinct joinedAt for stable ordering", () => {
    const state = baseState({ players: [] });

    const result = addPlayers(state, { names: ["Alice", "", "  Bob  ", "\n", "Carol"] });

    expect(result.players.map((p) => p.name)).toEqual(["Alice", "Bob", "Carol"]);
    const joinedAts = result.players.map((p) => p.joinedAt);
    expect(new Set(joinedAts).size).toBe(3);
    expect(joinedAts[0]).toBeLessThan(joinedAts[1]);
    expect(joinedAts[1]).toBeLessThan(joinedAts[2]);
  });

  it("skips names that collide with an existing player or an earlier name in the same batch", () => {
    const existing = makePlayer({ name: "Alice" });
    const state = baseState({ players: [existing] });

    const result = addPlayers(state, { names: ["alice", "Bob", "bob", "Carol"] });

    expect(result.players.map((p) => p.name)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("no-ops if every name is blank or a duplicate", () => {
    const existing = makePlayer({ name: "Alice" });
    const state = baseState({ players: [existing] });

    const result = addPlayers(state, { names: ["", "  ", "Alice"] });

    expect(result).toBe(state);
  });
});

describe("linkPlayers", () => {
  it("links bidirectionally and auto-unlinks a previous partner when re-linking", () => {
    const a = makePlayer({ id: "a" });
    const b = makePlayer({ id: "b" });
    const c = makePlayer({ id: "c" });
    let state = baseState({ players: [a, b, c] });

    state = linkPlayers(state, { aId: "a", bId: "b" });
    expect(state.players.find((p) => p.id === "a")?.linkedPlayerId).toBe("b");
    expect(state.players.find((p) => p.id === "b")?.linkedPlayerId).toBe("a");

    state = linkPlayers(state, { aId: "a", bId: "c" });
    expect(state.players.find((p) => p.id === "a")?.linkedPlayerId).toBe("c");
    expect(state.players.find((p) => p.id === "c")?.linkedPlayerId).toBe("a");
    expect(state.players.find((p) => p.id === "b")?.linkedPlayerId).toBeUndefined();
  });
});
