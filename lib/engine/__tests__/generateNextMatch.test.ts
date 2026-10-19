import { describe, expect, it } from "vitest";
import { generateNextMatchForCourt, nextUpQueue, repeatLookback } from "@/lib/engine/generateNextMatch";
import { currentMatchForCourt, fillOpenCourts, recordResult, startMatch } from "@/lib/mutations/rounds";
import { startSession } from "@/lib/mutations/settings";
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
    newcomer: false,
    gamesCredit: 0,
    skillRating: 2,
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
    const state = baseState({ players, settings: { format: "doubles", courtCount: 1, resultEntry: "winner" } });

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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    for (const busyId of [players[0].id, players[1].id, players[2].id, players[3].id]) {
      expect(seated).not.toContain(busyId);
    }
  });

  it("returns no match when fewer than 4 free players are available", () => {
    const players = Array.from({ length: 3 }, () => makePlayer());
    const state = baseState({ players, settings: { format: "doubles", courtCount: 1, resultEntry: "winner" } });

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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 2, resultEntry: "winner" },
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
      settings: { format: "doubles", courtCount: 1, resultEntry: "winner" },
    });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(streaking.id);
  });
});

describe("generateNextMatchForCourt — singles", () => {
  it("forms exactly one 1v1 match from the two highest-priority free players", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    const state = baseState({ players, settings: { format: "singles", courtCount: 1, resultEntry: "winner" } });

    const result = generateNextMatchForCourt(state, "c1");

    expect(result.match!.teamA).toHaveLength(1);
    expect(result.match!.teamB).toHaveLength(1);
  });

  it("returns no match when fewer than 2 free players are available", () => {
    const players = [makePlayer()];
    const state = baseState({ players, settings: { format: "singles", courtCount: 1, resultEntry: "winner" } });

    const result = generateNextMatchForCourt(state, "c1");

    expect(result.match).toBeNull();
  });

  it("force-rests whoever has a 2-game streak", () => {
    const rested = makePlayer({ consecutiveGames: 2, joinedAt: 1 });
    const others = Array.from({ length: 3 }, () => makePlayer({ gamesPlayed: 3 }));
    const state = baseState({ players: [rested, ...others], settings: { format: "singles", courtCount: 1, resultEntry: "winner" } });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).not.toContain(rested.id);
  });

  it("guarantees a spot for anyone who has sat out 2 cycles in a row, even over a tie-break", () => {
    const overdue = makePlayer({ gamesPlayed: 5, consecutiveSitOuts: 2 });
    const others = Array.from({ length: 3 }, () => makePlayer({ gamesPlayed: 0 }));
    const state = baseState({ players: [overdue, ...others], settings: { format: "singles", courtCount: 1, resultEntry: "winner" } });

    const result = generateNextMatchForCourt(state, "c1");

    const seated = [...result.match!.teamA, ...result.match!.teamB];
    expect(seated).toContain(overdue.id);
  });
});

describe("generateNextMatchForCourt — avoiding a repeat foursome", () => {
  const DOUBLES = { format: "doubles", courtCount: 1, resultEntry: "winner" } as const;

  function played(teamA: string[], teamB: string[], n: number): Match {
    return { id: `m${n}`, roundNumber: n, courtId: "c1", teamA, teamB, winner: "A", startedAt: 1, timestamp: n };
  }

  function seatedIds(result: ReturnType<typeof generateNextMatchForCourt>): string[] {
    return [...result.match!.teamA, ...result.match!.teamB].sort();
  }

  // a–d are first in line and just played together; e and f wait behind them.
  function justPlayed(extra: Partial<Player>[] = [{}, {}]): SessionState {
    const front = ["a", "b", "c", "d"].map((id, i) => makePlayer({ id, queuePosition: i + 1 }));
    const back = extra.map((o, i) => makePlayer({ id: "ef"[i], queuePosition: 5 + i, gamesPlayed: 1, ...o }));
    return baseState({ players: [...front, ...back], matches: [played(["a", "b"], ["c", "d"], 1)], matchSequence: 1, settings: DOUBLES });
  }

  it("swaps the last two of the four for the next two in line", () => {
    const state = justPlayed();
    const result = generateNextMatchForCourt(state, "c1");
    expect(seatedIds(result)).toEqual(["a", "b", "e", "f"]);
    expect(result.restedPlayerIds).toEqual(expect.arrayContaining(["c", "d"]));
    // Next Up shows the swapped lineup first, so it matches what gets seated.
    expect(nextUpQueue(state).slice(0, 4).flatMap((u) => u.playerIds).sort()).toEqual(["a", "b", "e", "f"]);
  });

  it("swaps just one when only one other player is waiting", () => {
    expect(seatedIds(generateNextMatchForCourt(justPlayed([{}]), "c1"))).toEqual(["a", "b", "c", "e"]);
  });

  it("swaps two players when only a linked pair is waiting", () => {
    const state = justPlayed([{ linkedPlayerId: "f" }, { linkedPlayerId: "e" }]);
    expect(seatedIds(generateNextMatchForCourt(state, "c1"))).toEqual(["a", "b", "e", "f"]);
  });

  it("swaps in a waiting player over a resting one", () => {
    const state = justPlayed([{ consecutiveGames: 1 }, {}]);
    expect(seatedIds(generateNextMatchForCourt(state, "c1"))).toEqual(["a", "b", "c", "f"]);
  });

  it("never swaps out a newcomer", () => {
    const state = justPlayed();
    const newcomers = { ...state, players: state.players.map((p) => (p.id === "e" || p.id === "f" ? p : { ...p, newcomer: true })) };
    expect(seatedIds(generateNextMatchForCourt(newcomers, "c1"))).toEqual(["a", "b", "c", "d"]);
  });

  it("lets the repeat stand when no one else is free", () => {
    const state = justPlayed([]);
    expect(seatedIds(generateNextMatchForCourt(state, "c1"))).toEqual(["a", "b", "c", "d"]);
  });

  it("only looks back the last few matches", () => {
    const state = justPlayed();
    const lookback = repeatLookback(state);
    const later = Array.from({ length: lookback }, (_, i) => played(["w", "x"], ["y", "z"], i + 2));
    const old = { ...state, matches: [...state.matches, ...later], matchSequence: lookback + 1 };
    expect(seatedIds(generateNextMatchForCourt(old, "c1"))).toEqual(["a", "b", "c", "d"]);
  });

  it("looks back the last few matches of every court, not just the open one", () => {
    const state = justPlayed();
    const lookback = repeatLookback(state);
    const otherCourt = Array.from({ length: lookback }, (_, i) => ({ ...played(["w", "x"], ["y", "z"], i + 2), courtId: "c2" }));
    const busyElsewhere = { ...state, matches: [...state.matches, ...otherCourt], matchSequence: lookback + 1 };
    expect(seatedIds(generateNextMatchForCourt(busyElsewhere, "c1"))).toEqual(["a", "b", "e", "f"]);
  });

  it("looks back one full rotation of the pool, never fewer than 2 matches", () => {
    const pool = (count: number, courtCount: number) =>
      baseState({
        players: Array.from({ length: count }, () => makePlayer()),
        courts: Array.from({ length: courtCount }, (_, i) => ({ id: `c${i + 1}`, name: `Court ${i + 1}` })),
      });
    expect(repeatLookback(pool(6, 1))).toBe(2);
    expect(repeatLookback(pool(12, 1))).toBe(3);
    expect(repeatLookback(pool(16, 1))).toBe(4);
    expect(repeatLookback(pool(12, 2))).toBe(2);
  });

  it.each([
    [8, 1],
    [12, 1],
    [16, 1],
    [12, 2],
    [16, 2],
  ])("keeps %i players on %i court(s) from replaying a recent foursome, with games still even", (count, courtCount) => {
    const players = Array.from({ length: count }, (_, i) => makePlayer({ id: `s${i + 1}`, queuePosition: i + 1 }));
    const courts = Array.from({ length: courtCount }, (_, i) => ({ id: `c${i + 1}`, name: `Court ${i + 1}` }));
    let state = fillOpenCourts(startSession(baseState({ players, courts, sessionStarted: false, settings: { ...DOUBLES, courtCount } })));
    const lineups: string[] = [];
    for (let n = 0; n < 12; n++) {
      const match = currentMatchForCourt(state, courts[n % courtCount].id)!;
      lineups.push([...match.teamA, ...match.teamB].sort().join());
      state = fillOpenCourts(startMatch(state, { matchId: match.id }));
      state = fillOpenCourts(recordResult(state, { matchId: match.id, winner: "A" }));
    }
    // Each court's lookback, with courts taking turns, spans lookback × courtCount overall.
    const window = repeatLookback(state) * courtCount;
    lineups.forEach((lineup, i) => expect(lineups.slice(Math.max(0, i - window), i)).not.toContain(lineup));
    const games = state.players.map((p) => p.gamesPlayed);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
  });
});
