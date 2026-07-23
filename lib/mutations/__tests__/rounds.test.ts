import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, type Player, type SessionState } from "@/lib/schemas";
import {
  changeResult,
  currentMatchForCourt,
  fillOpenCourts,
  isMatchSwappable,
  matchHistory,
  recordResult,
  startMatch,
  swapPlayerInMatch,
} from "@/lib/mutations/rounds";

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

describe("fillOpenCourts", () => {
  it("no-ops until the session has started", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const state = baseState({ players, sessionStarted: false });

    const result = fillOpenCourts(state);

    expect(result).toBe(state);
  });

  it("fills every open court independently from the shared free-player pool", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const state = baseState({ players });

    const result = fillOpenCourts(state);

    expect(currentMatchForCourt(result, "c1")).toBeDefined();
    expect(currentMatchForCourt(result, "c2")).toBeDefined();
    const allPlaying = result.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    expect(new Set(allPlaying).size).toBe(8);
  });

  it("leaves a court empty (waiting) when there aren't enough free players for it", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    const state = baseState({ players });

    const result = fillOpenCourts(state);

    expect(currentMatchForCourt(result, "c1")).toBeDefined();
    expect(currentMatchForCourt(result, "c2")).toBeUndefined();
  });

  it("is a no-op (same reference) once every court already has a pending match", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const state = fillOpenCourts(baseState({ players }));

    const result = fillOpenCourts(state);

    expect(result).toBe(state);
  });
});

describe("startMatch / recordResult gating", () => {
  it("recordResult no-ops until the match has been started", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players }));
    const match = currentMatchForCourt(state, "c1")!;
    expect(match.startedAt).toBeNull();

    const notStarted = recordResult(state, { matchId: match.id, winner: "A" });
    expect(notStarted).toBe(state);

    state = startMatch(state, { matchId: match.id });
    expect(currentMatchForCourt(state, "c1")!.startedAt).not.toBeNull();

    const started = recordResult(state, { matchId: match.id, winner: "A" });
    expect(started.matches.find((m) => m.id === match.id)?.winner).toBe("A");
  });

  it("increments consecutiveGames for everyone in the match on record, without double-counting on a winner change", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players }));
    const match = currentMatchForCourt(state, "c1")!;
    state = startMatch(state, { matchId: match.id });
    state = recordResult(state, { matchId: match.id, winner: "A" });

    for (const id of [...match.teamA, ...match.teamB]) {
      expect(state.players.find((p) => p.id === id)?.consecutiveGames).toBe(1);
    }

    state = changeResult(state, { matchId: match.id, winner: "B" });
    for (const id of [...match.teamA, ...match.teamB]) {
      expect(state.players.find((p) => p.id === id)?.consecutiveGames).toBe(1);
    }
  });

  it("auto-generates the next match for a court the instant its result is recorded", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players, courts: [{ id: "c1", name: "Court 1" }] }));
    const firstMatch = currentMatchForCourt(state, "c1")!;
    state = startMatch(state, { matchId: firstMatch.id });

    state = fillOpenCourts(recordResult(state, { matchId: firstMatch.id, winner: "A" }));

    const nextMatch = currentMatchForCourt(state, "c1")!;
    expect(nextMatch.id).not.toBe(firstMatch.id);
    expect(nextMatch.startedAt).toBeNull();
  });
});

describe("swapPlayerInMatch", () => {
  it("two-way swaps players between two different not-yet-started matches", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const state = fillOpenCourts(baseState({ players }));
    const matchA = currentMatchForCourt(state, "c1")!;
    const matchB = currentMatchForCourt(state, "c2")!;
    const outPlayerId = matchA.teamA[0];
    const inPlayerId = matchB.teamA[0];
    const before = state.players.map((p) => ({ id: p.id, gamesPlayed: p.gamesPlayed, joinedAt: p.joinedAt }));

    const swapped = swapPlayerInMatch(state, { matchId: matchA.id, outPlayerId, inPlayerId });

    const swappedMatchA = swapped.matches.find((m) => m.id === matchA.id)!;
    const swappedMatchB = swapped.matches.find((m) => m.id === matchB.id)!;
    expect(swappedMatchA.teamA).toContain(inPlayerId);
    expect(swappedMatchA.teamA).not.toContain(outPlayerId);
    expect(swappedMatchB.teamA).toContain(outPlayerId);
    expect(swappedMatchB.teamA).not.toContain(inPlayerId);

    const after = swapped.players.map((p) => ({ id: p.id, gamesPlayed: p.gamesPlayed, joinedAt: p.joinedAt }));
    expect(after).toEqual(before);
  });

  it("switches a player to the opposing team within the same not-yet-started match", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const state = fillOpenCourts(baseState({ players }));
    const match = currentMatchForCourt(state, "c1")!;
    const outPlayerId = match.teamA[0];
    const inPlayerId = match.teamB[0];

    const swapped = swapPlayerInMatch(state, { matchId: match.id, outPlayerId, inPlayerId });

    const swappedMatch = swapped.matches.find((m) => m.id === match.id)!;
    expect(swappedMatch.teamA).toContain(inPlayerId);
    expect(swappedMatch.teamA).not.toContain(outPlayerId);
    expect(swappedMatch.teamB).toContain(outPlayerId);
    expect(swappedMatch.teamB).not.toContain(inPlayerId);
    // Still exactly 2 per side — nobody duplicated or dropped.
    expect(swappedMatch.teamA).toHaveLength(2);
    expect(swappedMatch.teamB).toHaveLength(2);
  });

  it("one-way swaps in a fully free/waiting player", () => {
    const players = Array.from({ length: 5 }, () => makePlayer());
    const state = fillOpenCourts(baseState({ players, courts: [{ id: "c1", name: "Court 1" }] }));
    const match = currentMatchForCourt(state, "c1")!;
    const playingIds = new Set([...match.teamA, ...match.teamB]);
    const waitingPlayer = players.find((p) => !playingIds.has(p.id))!;
    const outPlayerId = match.teamA[0];

    const swapped = swapPlayerInMatch(state, { matchId: match.id, outPlayerId, inPlayerId: waitingPlayer.id });

    const swappedMatch = swapped.matches.find((m) => m.id === match.id)!;
    expect(swappedMatch.teamA).toContain(waitingPlayer.id);
    expect(swappedMatch.teamA).not.toContain(outPlayerId);
  });

  it("no-ops once the match has started", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players }));
    const matchA = currentMatchForCourt(state, "c1")!;
    const matchB = currentMatchForCourt(state, "c2")!;
    state = startMatch(state, { matchId: matchA.id });
    expect(isMatchSwappable(currentMatchForCourt(state, "c1")!)).toBe(false);

    const swapped = swapPlayerInMatch(state, {
      matchId: matchA.id,
      outPlayerId: matchA.teamA[0],
      inPlayerId: matchB.teamA[0],
    });

    expect(swapped).toBe(state);
  });

  it("no-ops if the target player is actively playing (started) elsewhere", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players }));
    const matchA = currentMatchForCourt(state, "c1")!;
    const matchB = currentMatchForCourt(state, "c2")!;
    state = startMatch(state, { matchId: matchB.id });

    const swapped = swapPlayerInMatch(state, {
      matchId: matchA.id,
      outPlayerId: matchA.teamA[0],
      inPlayerId: matchB.teamA[0],
    });

    expect(swapped).toBe(state);
  });

  it("clears consecutiveSitOuts for a benched player brought in, so they don't immediately re-qualify for a guaranteed spot after playing (regression)", () => {
    const A = makePlayer({ id: "A" });
    const B = makePlayer({ id: "B" });
    const C = makePlayer({ id: "C" });
    const D = makePlayer({ id: "D" });
    // P already sat out 2 cycles in a row (elsewhere in the session) before
    // this pending match was generated, so P isn't in it.
    const P = makePlayer({ id: "P", consecutiveSitOuts: 2 });
    const Q = makePlayer({ id: "Q" });
    const pendingMatch = {
      id: "m1",
      roundNumber: 1,
      courtId: "c1",
      teamA: ["A", "B"],
      teamB: ["C", "D"],
      winner: null,
      startedAt: null,
      timestamp: Date.now(),
    };
    let state = baseState({
      courts: [{ id: "c1", name: "Court 1" }],
      players: [A, B, C, D, P, Q],
      matches: [pendingMatch],
    });

    state = swapPlayerInMatch(state, { matchId: "m1", outPlayerId: "C", inPlayerId: "P" });
    expect(state.players.find((p) => p.id === "P")?.consecutiveSitOuts).toBe(0);

    const match = currentMatchForCourt(state, "c1")!;
    state = startMatch(state, { matchId: match.id });
    state = fillOpenCourts(recordResult(state, { matchId: match.id, winner: "A" }));

    const nextMatch = currentMatchForCourt(state, "c1")!;
    const seated = [...nextMatch.teamA, ...nextMatch.teamB];
    expect(seated).not.toContain("P");
  });
});

describe("changeResult", () => {
  it("reverts the previous winner's stats and applies the new one", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players }));
    const match = currentMatchForCourt(state, "c1")!;
    state = startMatch(state, { matchId: match.id });
    state = recordResult(state, { matchId: match.id, winner: "A" });

    const teamAId = match.teamA[0];
    const teamBId = match.teamB[0];
    expect(state.players.find((p) => p.id === teamAId)?.wins).toBe(1);
    expect(state.players.find((p) => p.id === teamBId)?.losses).toBe(1);

    state = changeResult(state, { matchId: match.id, winner: "B" });

    expect(state.matches.find((m) => m.id === match.id)?.winner).toBe("B");
    expect(state.players.find((p) => p.id === teamAId)?.wins).toBe(0);
    expect(state.players.find((p) => p.id === teamAId)?.losses).toBe(1);
    expect(state.players.find((p) => p.id === teamBId)?.wins).toBe(1);
    expect(state.players.find((p) => p.id === teamBId)?.losses).toBe(0);
    expect(state.players.find((p) => p.id === teamAId)?.gamesPlayed).toBe(1);
    expect(state.players.find((p) => p.id === teamAId)?.consecutiveGames).toBe(1);
  });

  it("no-ops if the match isn't decided yet or the winner is unchanged", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players }));
    const match = currentMatchForCourt(state, "c1")!;
    state = startMatch(state, { matchId: match.id });

    const beforeRecording = changeResult(state, { matchId: match.id, winner: "A" });
    expect(beforeRecording).toBe(state);

    state = recordResult(state, { matchId: match.id, winner: "A" });
    const sameWinner = changeResult(state, { matchId: match.id, winner: "A" });
    expect(sameWinner).toBe(state);
  });
});

describe("consecutiveSitOuts tracking", () => {
  it("increments for benched players each cycle and resets once they're seated", () => {
    // 6 players, 1 court doubles: exactly 2 sit out each cycle.
    const players = Array.from({ length: 6 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players, courts: [{ id: "c1", name: "Court 1" }] }));
    let match = currentMatchForCourt(state, "c1")!;
    const benchedFirst = players.filter((p) => ![...match.teamA, ...match.teamB].includes(p.id));
    for (const p of benchedFirst) {
      expect(state.players.find((pp) => pp.id === p.id)?.consecutiveSitOuts).toBe(1);
    }

    state = startMatch(state, { matchId: match.id });
    state = fillOpenCourts(recordResult(state, { matchId: match.id, winner: "A" }));

    // Whoever played the first match and is now benched should be at 1 (fresh
    // streak), and whoever was benched-then-selected should be back to 0.
    match = currentMatchForCourt(state, "c1")!;
    const nowPlayingIds = new Set([...match.teamA, ...match.teamB]);
    for (const p of benchedFirst) {
      if (nowPlayingIds.has(p.id)) {
        expect(state.players.find((pp) => pp.id === p.id)?.consecutiveSitOuts).toBe(0);
      }
    }
  });
});

describe("matchHistory", () => {
  it("includes only decided matches, most recently finished first", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    let state = fillOpenCourts(baseState({ players, courts: [{ id: "c1", name: "Court 1" }] }));
    const match1 = currentMatchForCourt(state, "c1")!;
    state = startMatch(state, { matchId: match1.id });
    state = fillOpenCourts(recordResult(state, { matchId: match1.id, winner: "A" }));

    const match2 = currentMatchForCourt(state, "c1")!;
    expect(match2.id).not.toBe(match1.id);
    state = startMatch(state, { matchId: match2.id });
    state = fillOpenCourts(recordResult(state, { matchId: match2.id, winner: "B" }));

    const history = matchHistory(state);

    expect(history.map((m) => m.id)).toEqual([match2.id, match1.id]);
    expect(history.every((m) => m.winner !== null)).toBe(true);
  });

  it("excludes not-yet-decided matches", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    const state = fillOpenCourts(baseState({ players, courts: [{ id: "c1", name: "Court 1" }] }));

    expect(matchHistory(state)).toHaveLength(0);
  });
});
