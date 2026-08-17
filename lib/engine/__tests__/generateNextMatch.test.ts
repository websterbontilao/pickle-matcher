import { describe, expect, it } from "vitest";
import { generateNextMatchForCourt } from "@/lib/engine/generateNextMatch";
import { EMPTY_SESSION_STATE, type Match, type Player, type SessionState } from "@/lib/schemas";

let idCounter = 0;
function makePlayer(overrides: Partial<Player> = {}): Player {
  idCounter += 1;
  return {
    id: overrides.id ?? `p${idCounter}`,
    name: overrides.name ?? `Player ${idCounter}`,
    active: true,
    joinedAt: idCounter,
    queuePosition: overrides.queuePosition ?? idCounter,
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
    courts: [{ id: "c1", name: "Court 1" }],
    sessionStarted: true,
    ...overrides,
  };
}

describe("generateNextMatchForCourt — doubles", () => {
  it("forms exactly one 2v2 match from the highest-priority free players", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const state = baseState({ players, settings: { format: "doubles", courtCount: 1 } });

    const result = generateNextMatchForCourt(state, "c1");

    expect(result.match).not.toBeNull();
    expect(result.match!.teamA).toHaveLength(2);
    expect(result.match!.teamB).toHaveLength(2);
    expect(result.match!.startedAt).toBeNull();
    expect(result.match!.winner).toBeNull();
  });

  it("excludes players currently busy in an undecided match on another court", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const busyMatch: Match = {
      id: "busy",
      roundNumber: 1,
      courtId: "other-court",
      teamA: [players[0].id, players[1].id],
      teamB: [players[2].id, players[3].id],
      winner: null,
      startedAt: null,
      timestamp: 1,
    };
    const state = baseState({
      players,
      matches: [busyMatch],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    for (const busyId of [players[0].id, players[1].id, players[2].id, players[3].id]) {
      expect(seated).not.toContain(busyId);
    }
  });

  it("returns no match when fewer than 4 free players are available", () => {
    const players = Array.from({ length: 3 }, () => makePlayer());
    const state = baseState({ players, settings: { format: "doubles", courtCount: 1 } });

    const result = generateNextMatchForCourt(state, "c1");

    expect(result.match).toBeNull();
    expect(result.restedSitOuts).toHaveLength(0);
  });

  it("keeps a linked pair together, benching them together rather than splitting", () => {
    const single = makePlayer({ gamesPlayed: 0, joinedAt: 1 });
    const a = makePlayer({ id: "a", linkedPlayerId: "b", joinedAt: 2 });
    const b = makePlayer({ id: "b", linkedPlayerId: "a", joinedAt: 2 });
    const c = makePlayer({ id: "c", linkedPlayerId: "d", joinedAt: 3 });
    const d = makePlayer({ id: "d", linkedPlayerId: "c", joinedAt: 3 });
    const state = baseState({
      players: [single, a, b, c, d],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB].sort();
    expect(seated).toEqual(["a", "b", "c", "d"]);
    expect(result.restedSitOuts).toHaveLength(1);
    expect(result.restedSitOuts[0].playerId).toBe(single.id);
  });

  it("force-rests anyone with a 2-game streak, unless that would leave too few to fill the match", () => {
    const rested = makePlayer({ consecutiveGames: 2, gamesPlayed: 0, joinedAt: 1 });
    const others = Array.from({ length: 4 }, () => makePlayer({ gamesPlayed: 3 }));
    const state = baseState({
      players: [rested, ...others],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).not.toContain(rested.id);
    expect(result.restedSitOuts.some((s) => s.playerId === rested.id && s.reason.includes("Resting"))).toBe(true);
  });

  it("scrambles unlinked pairs using partner+opponent history instead of repeating the same split", () => {
    const a = makePlayer({ id: "a" });
    const b = makePlayer({ id: "b" });
    const c = makePlayer({ id: "c" });
    const d = makePlayer({ id: "d" });
    // Prior match: a&b partnered against c&d — the worst possible split to
    // repeat, since it maximizes both same-partner and same-opponent overlap.
    const priorMatch: Match = {
      id: "prior",
      roundNumber: 1,
      courtId: "c1",
      teamA: ["a", "b"],
      teamB: ["c", "d"],
      winner: "A",
      startedAt: 1,
      timestamp: 2,
    };
    const state = baseState({
      players: [a, b, c, d],
      matches: [priorMatch],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const teamA = result.match!.teamA.slice().sort();
    const teamB = result.match!.teamB.slice().sort();
    const repeatsExactSplit =
      (teamA.join() === ["a", "b"].join() && teamB.join() === ["c", "d"].join()) ||
      (teamA.join() === ["c", "d"].join() && teamB.join() === ["a", "b"].join());
    expect(repeatsExactSplit).toBe(false);
  });

  it("ignores the rest rule when there aren't enough other players to fill the match", () => {
    const rested = makePlayer({ consecutiveGames: 5 });
    const others = Array.from({ length: 3 }, () => makePlayer());
    const state = baseState({
      players: [rested, ...others],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(rested.id);
  });

  it("guarantees a spot for anyone who has sat out 2 cycles in a row, even over a tie-break", () => {
    // Overdue has MORE games played than the others (so normal priority
    // would rank them last), but they're on a forced-play streak — they
    // must still be seated.
    const overdue = makePlayer({ gamesPlayed: 5, consecutiveSitOuts: 2, joinedAt: 99 });
    const others = Array.from({ length: 5 }, () => makePlayer({ gamesPlayed: 0 }));
    const state = baseState({
      players: [overdue, ...others],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(overdue.id);
  });

  it("keeps a linked pair together when guaranteeing them a forced-play spot", () => {
    const a = makePlayer({ id: "a", linkedPlayerId: "b", gamesPlayed: 5, consecutiveSitOuts: 2 });
    const b = makePlayer({ id: "b", linkedPlayerId: "a", gamesPlayed: 5, consecutiveSitOuts: 2 });
    const others = Array.from({ length: 4 }, () => makePlayer({ gamesPlayed: 0 }));
    const state = baseState({
      players: [a, b, ...others],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain("a");
    expect(seated).toContain("b");
    const sameTeam = result.match!.teamA.includes("a") ? result.match!.teamA : result.match!.teamB;
    expect(sameTeam).toContain("b");
  });

  it("scales the sit-out guarantee up for a large pool on a single court — 2 misses isn't enough, 4 is", () => {
    // 20 players, 1 doubles court -> 4 slots/cycle -> threshold = ceil(20/4) - 1 = 4.
    const notYetOverdue = makePlayer({ gamesPlayed: 5, consecutiveSitOuts: 2, joinedAt: 99 });
    const others = Array.from({ length: 19 }, () => makePlayer({ gamesPlayed: 0 }));
    const state = baseState({
      players: [notYetOverdue, ...others],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).not.toContain(notYetOverdue.id);
  });

  it("scales the sit-out guarantee up for a large pool — 4 misses is enough", () => {
    const overdue = makePlayer({ gamesPlayed: 5, consecutiveSitOuts: 4, joinedAt: 99 });
    const others = Array.from({ length: 19 }, () => makePlayer({ gamesPlayed: 0 }));
    const state = baseState({
      players: [overdue, ...others],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(overdue.id);
  });

  it("scales the sit-out guarantee down when courts are relatively plentiful — 1 miss is enough", () => {
    // 12 players, 2 doubles courts -> 8 slots/cycle -> threshold = ceil(12/8) - 1 = 1.
    const overdue = makePlayer({ gamesPlayed: 5, consecutiveSitOuts: 1, joinedAt: 99 });
    const others = Array.from({ length: 11 }, () => makePlayer({ gamesPlayed: 0 }));
    const busyMatch: Match = {
      id: "busy",
      roundNumber: 1,
      courtId: "c2",
      teamA: [others[0].id, others[1].id],
      teamB: [others[2].id, others[3].id],
      winner: null,
      startedAt: null,
      timestamp: 1,
    };
    const state = baseState({
      players: [overdue, ...others],
      courts: [{ id: "c1", name: "Court 1" }, { id: "c2", name: "Court 2" }],
      matches: [busyMatch],
      settings: { format: "doubles", courtCount: 2 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(overdue.id);
  });

  it("scales the forced-rest threshold up for a large pool — a 2-game streak isn't forced to rest", () => {
    const streaking = makePlayer({ consecutiveGames: 2, gamesPlayed: 0, joinedAt: 1 });
    const others = Array.from({ length: 19 }, () => makePlayer({ gamesPlayed: 3 }));
    const state = baseState({
      players: [streaking, ...others],
      settings: { format: "doubles", courtCount: 1 },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(streaking.id);
  });
});

describe("generateNextMatchForCourt — singles", () => {
  it("forms exactly one 1v1 match from the two highest-priority free players", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    const state = baseState({ players, settings: { format: "singles", courtCount: 1 } });

    const result = generateNextMatchForCourt(state, "c1");

    expect(result.match!.teamA).toHaveLength(1);
    expect(result.match!.teamB).toHaveLength(1);
  });

  it("returns no match when fewer than 2 free players are available", () => {
    const players = [makePlayer()];
    const state = baseState({ players, settings: { format: "singles", courtCount: 1 } });

    const result = generateNextMatchForCourt(state, "c1");

    expect(result.match).toBeNull();
  });

  it("force-rests whoever has a 2-game streak", () => {
    const rested = makePlayer({ consecutiveGames: 2, joinedAt: 1 });
    const others = Array.from({ length: 3 }, () => makePlayer({ gamesPlayed: 3 }));
    const state = baseState({ players: [rested, ...others], settings: { format: "singles", courtCount: 1 } });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).not.toContain(rested.id);
  });

  it("guarantees a spot for anyone who has sat out 2 cycles in a row, even over a tie-break", () => {
    const overdue = makePlayer({ gamesPlayed: 5, consecutiveSitOuts: 2 });
    const others = Array.from({ length: 3 }, () => makePlayer({ gamesPlayed: 0 }));
    const state = baseState({ players: [overdue, ...others], settings: { format: "singles", courtCount: 1 } });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(overdue.id);
  });
});
