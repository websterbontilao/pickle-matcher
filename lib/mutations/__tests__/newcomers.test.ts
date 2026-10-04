import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, type Match, type Player, type SessionState } from "@/lib/schemas";
import { addPlayers, linkPlayers } from "@/lib/mutations/players";
import {
  busyPlayerIds,
  changeResult,
  currentMatchForCourt,
  fillOpenCourts,
  nextUpQueue,
  recordResult,
  startMatch,
  swapPlayerInMatch,
} from "@/lib/mutations/rounds";
import { startSession, stopSession } from "@/lib/mutations/settings";
import { rankedGames } from "@/lib/engine/restRules";

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

const ONE_COURT = [{ id: "c1", name: "Court 1" }];
const TWO_COURTS = [
  { id: "c1", name: "Court 1" },
  { id: "c2", name: "Court 2" },
];

function baseState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    ...EMPTY_SESSION_STATE,
    courts: ONE_COURT,
    settings: { format: "doubles", courtCount: 1 },
    sessionStarted: true,
    ...overrides,
  };
}

/** Fixed "random" so the back-of-queue shuffle in recordResult is
 * deterministic — finishers keep their relative order. */
const NO_SHUFFLE = { random: () => 0.9999 };

function seated(match: Match): string[] {
  return [...match.teamA, ...match.teamB];
}

function player(state: SessionState, idOrName: string): Player {
  return state.players.find((p) => p.id === idOrName || p.name === idOrName)!;
}

/** Start → record → refill, the same pipeline the UI drives. */
function playCourt(state: SessionState, courtId: string, winner: "A" | "B" = "A", deps = NO_SHUFFLE): SessionState {
  const match = currentMatchForCourt(state, courtId)!;
  const started = startMatch(state, { matchId: match.id });
  return fillOpenCourts(recordResult(started, { matchId: match.id, winner }, deps));
}

function regulars(count: number, overrides: Partial<Player> = {}): Player[] {
  return Array.from({ length: count }, (_, i) => makePlayer({ id: `r${i + 1}`, queuePosition: i + 1, ...overrides }));
}

describe("newcomer status", () => {
  it("is only given to players added after the session has started", () => {
    let state = baseState({ sessionStarted: false });
    state = addPlayers(state, { names: ["Setup Sam"] });
    expect(player(state, "Setup Sam").newcomer).toBe(false);

    state = startSession(state);
    state = addPlayers(state, { names: ["Late Lou"] });
    expect(player(state, "Late Lou").newcomer).toBe(true);
    expect(player(state, "Late Lou").gamesCredit).toBe(0);
  });

  it("is cleared if the session is stopped again before any match starts", () => {
    let state = addPlayers(baseState(), { names: ["Late Lou"] });
    state = stopSession(state);
    expect(player(state, "Late Lou").newcomer).toBe(false);
  });
});

describe("newcomer priority", () => {
  it("seats a newcomer ahead of even forced-play (benched) players", () => {
    // 9 active on 1 doubles court → streak threshold 2. Four regulars are
    // owed a guaranteed spot; the newcomer still goes first.
    const benched = regulars(4, { consecutiveSitOuts: 2, gamesPlayed: 3 });
    const others = Array.from({ length: 4 }, (_, i) => makePlayer({ id: `o${i + 1}`, gamesPlayed: 3, queuePosition: 10 + i }));
    const nina = makePlayer({ id: "nina", newcomer: true, queuePosition: 100 });
    const state = fillOpenCourts(baseState({ players: [...benched, ...others, nina] }));

    const match = currentMatchForCourt(state, "c1")!;
    expect(seated(match)).toContain("nina");
    expect(seated(match).filter((id) => id.startsWith("r"))).toHaveLength(3);
  });

  it("only lasts for the first match — afterwards they rank level with the field instead of catching up", () => {
    let state = baseState({ players: regulars(8, { gamesPlayed: 4 }) });
    state = fillOpenCourts(addPlayers(state, { names: ["Nina"] }));
    const nina = player(state, "Nina");

    const first = currentMatchForCourt(state, "c1")!;
    expect(seated(first)).toContain(nina.id);

    state = playCourt(state, "c1");
    const after = player(state, nina.id);
    expect(after.newcomer).toBe(false);
    expect(after.gamesPlayed).toBe(1);
    // Field's lowest is the four regulars still on 4 games.
    expect(rankedGames(after)).toBe(4);

    // Before this change she'd have 1 game vs everyone's 4–5 and be
    // re-seated immediately; now the four waiting regulars go first.
    const second = currentMatchForCourt(state, "c1")!;
    expect(seated(second)).not.toContain(nina.id);
    expect(seated(second).sort()).toEqual(["r4", "r5", "r6", "r7"]);
  });

  it("computes the credit when the first match is recorded, not when they joined", () => {
    // Nina joined when the field was on 2 games, but by the time her first
    // match is recorded the field has moved on to 6.
    const field = regulars(6, { gamesPlayed: 6 });
    const nina = makePlayer({ id: "nina", newcomer: true });
    const match: Match = {
      id: "m1",
      roundNumber: 1,
      courtId: "c1",
      teamA: ["nina", "r1"],
      teamB: ["r2", "r3"],
      winner: null,
      startedAt: 1,
      timestamp: 1,
    };
    const state = recordResult(baseState({ players: [...field, nina], matches: [match], matchSequence: 1 }), {
      matchId: "m1",
      winner: "A",
    });

    expect(rankedGames(player(state, "nina"))).toBe(6);
    expect(player(state, "nina").gamesCredit).toBe(5);
  });

  it("ignores other still-unplayed newcomers when finding the field's lowest count", () => {
    const field = regulars(6, { gamesPlayed: 4 });
    const first = makePlayer({ id: "first", newcomer: true });
    const second = makePlayer({ id: "second", newcomer: true });
    const match: Match = {
      id: "m1",
      roundNumber: 1,
      courtId: "c1",
      teamA: ["first", "r1"],
      teamB: ["r2", "r3"],
      winner: null,
      startedAt: 1,
      timestamp: 1,
    };
    const state = recordResult(baseState({ players: [...field, first, second], matches: [match], matchSequence: 1 }), {
      matchId: "m1",
      winner: "B",
    });

    expect(rankedGames(player(state, "first"))).toBe(4);
    expect(player(state, "second").newcomer).toBe(true);
  });

  it("gives a linked unit newcomer priority if either member is a newcomer", () => {
    let state = baseState({ players: regulars(8, { gamesPlayed: 5 }) });
    state = addPlayers(state, { names: ["Nina"] });
    const ninaId = player(state, "Nina").id;
    state = linkPlayers(state, { aId: ninaId, bId: "r8" });

    const queue = nextUpQueue(state);
    expect(queue[0].playerIds.sort()).toEqual([ninaId, "r8"].sort());
    expect(queue[0].tier).toBe("newcomer");

    state = fillOpenCourts(state);
    expect(seated(currentMatchForCourt(state, "c1")!)).toEqual(expect.arrayContaining([ninaId, "r8"]));
  });

  it("isn't restored by changing the result of their first match", () => {
    let state = fillOpenCourts(addPlayers(baseState({ players: regulars(8, { gamesPlayed: 4 }) }), { names: ["Nina"] }));
    const first = currentMatchForCourt(state, "c1")!;
    state = playCourt(state, "c1", "A");
    const credit = player(state, "Nina").gamesCredit;

    state = changeResult(state, { matchId: first.id, winner: "B" });
    const nina = player(state, "Nina");
    expect(nina.newcomer).toBe(false);
    expect(nina.gamesPlayed).toBe(1);
    expect(nina.gamesCredit).toBe(credit);
  });
});

describe("nextUpQueue", () => {
  it("orders newcomers, then guaranteed, then normal, then resting — the order the scheduler seats them", () => {
    // 9 active, 1 court → threshold 2.
    const resting = makePlayer({ id: "resting", consecutiveGames: 2, gamesPlayed: 0, queuePosition: 1 });
    const normal = [
      makePlayer({ id: "n1", gamesPlayed: 1, queuePosition: 2 }),
      makePlayer({ id: "n2", gamesPlayed: 1, queuePosition: 3 }),
      makePlayer({ id: "n3", gamesPlayed: 2, queuePosition: 4 }),
      makePlayer({ id: "n4", gamesPlayed: 2, queuePosition: 5 }),
      makePlayer({ id: "n5", gamesPlayed: 2, queuePosition: 6 }),
    ];
    const guaranteed = makePlayer({ id: "guaranteed", consecutiveSitOuts: 2, gamesPlayed: 3, queuePosition: 7 });
    const newbie = makePlayer({ id: "newbie", newcomer: true, queuePosition: 99 });
    const state = baseState({ players: [resting, ...normal, guaranteed, newbie] });

    const queue = nextUpQueue(state);
    expect(queue.map((u) => u.playerIds[0])).toEqual(["newbie", "guaranteed", "n1", "n2", "n3", "n4", "n5", "resting"]);
    expect(queue.map((u) => u.tier)).toEqual(["newcomer", "guaranteed", "normal", "normal", "normal", "normal", "normal", "resting"]);

    const match = currentMatchForCourt(fillOpenCourts(state), "c1")!;
    expect(seated(match).sort()).toEqual(["guaranteed", "n1", "n2", "newbie"]);
  });

  it("excludes anyone seated in an undecided match", () => {
    const state = fillOpenCourts(baseState({ players: regulars(6) }));
    const busy = busyPlayerIds(state);
    const queued = nextUpQueue(state).flatMap((u) => u.playerIds);
    expect(queued).toHaveLength(2);
    expect(queued.some((id) => busy.has(id))).toBe(false);
  });

  it("treats every player as their own entry in singles, even if linked", () => {
    let state = baseState({ players: regulars(4), settings: { format: "singles", courtCount: 1 } });
    state = linkPlayers(state, { aId: "r1", bId: "r2" });
    expect(nextUpQueue(state).every((u) => u.playerIds.length === 1)).toBe(true);
  });
});

describe("scheduling stays correct across swaps", () => {
  it("team switch within a pending match: stats, queue order, and the next match are unaffected", () => {
    let state = fillOpenCourts(baseState({ players: regulars(8) }));
    const match = currentMatchForCourt(state, "c1")!;
    const [a] = match.teamA;
    const [b] = match.teamB;

    state = swapPlayerInMatch(state, { matchId: match.id, outPlayerId: a, inPlayerId: b });
    const switched = currentMatchForCourt(state, "c1")!;
    expect(switched.teamA).toContain(b);
    expect(switched.teamB).toContain(a);

    state = playCourt(state, "c1");
    for (const id of seated(match)) {
      expect(player(state, id).gamesPlayed).toBe(1);
      expect(player(state, id).queuePosition).toBeGreaterThan(8);
    }
    expect(seated(currentMatchForCourt(state, "c1")!).sort()).toEqual(["r5", "r6", "r7", "r8"]);
  });

  it("cross-court swap between two pending matches: both play out and the next matches follow priority", () => {
    let state = fillOpenCourts(baseState({ players: regulars(12), courts: TWO_COURTS, settings: { format: "doubles", courtCount: 2 } }));
    const m1 = currentMatchForCourt(state, "c1")!;
    const m2 = currentMatchForCourt(state, "c2")!;
    const x = m1.teamA[0];
    const y = m2.teamB[0];

    state = swapPlayerInMatch(state, { matchId: m1.id, outPlayerId: x, inPlayerId: y });
    const c1Finishers = seated(currentMatchForCourt(state, "c1")!);
    expect(c1Finishers).toContain(y);
    expect(seated(currentMatchForCourt(state, "c2")!)).toContain(x);

    state = playCourt(state, "c1");
    // The four who never played (r9–r12) take court 1 straight away.
    expect(seated(currentMatchForCourt(state, "c1")!).sort()).toEqual(["r10", "r11", "r12", "r9"]);

    state = playCourt(state, "c2");
    expect(state.players.reduce((sum, p) => sum + p.gamesPlayed, 0)).toBe(8);
    // Court 2's refill comes from the earliest finishers (court 1's group).
    expect(seated(currentMatchForCourt(state, "c2")!).sort()).toEqual(c1Finishers.sort());
  });

  it("subbing a benched player in clears their streak; the player subbed out keeps their place in line", () => {
    // 6 players, 1 court: two wait.
    let state = fillOpenCourts(baseState({ players: regulars(6) }));
    const match = currentMatchForCourt(state, "c1")!;
    const [waiting] = nextUpQueue(state)[0].playerIds;
    expect(player(state, waiting).consecutiveSitOuts).toBe(1);
    const out = match.teamA[0];
    const outBefore = player(state, out);

    state = swapPlayerInMatch(state, { matchId: match.id, outPlayerId: out, inPlayerId: waiting });
    expect(player(state, waiting).consecutiveSitOuts).toBe(0);
    const outAfter = player(state, out);
    expect(outAfter.queuePosition).toBe(outBefore.queuePosition);
    expect(outAfter.gamesPlayed).toBe(outBefore.gamesPlayed);
    expect(nextUpQueue(state).flatMap((u) => u.playerIds)).toContain(out);

    state = playCourt(state, "c1");
    // Swapped-out player never played, so they're seated next.
    expect(seated(currentMatchForCourt(state, "c1")!)).toContain(out);
  });

  it("a newcomer swapped out before their first match keeps their priority", () => {
    let state = baseState({ players: regulars(8, { gamesPlayed: 3 }) });
    state = fillOpenCourts(addPlayers(state, { names: ["Nina"] }));
    const ninaId = player(state, "Nina").id;
    const match = currentMatchForCourt(state, "c1")!;
    expect(seated(match)).toContain(ninaId);

    const sub = nextUpQueue(state)[0].playerIds[0];
    state = swapPlayerInMatch(state, { matchId: match.id, outPlayerId: ninaId, inPlayerId: sub });
    expect(player(state, ninaId).newcomer).toBe(true);
    expect(nextUpQueue(state)[0]).toMatchObject({ playerIds: [ninaId], tier: "newcomer" });

    state = playCourt(state, "c1");
    expect(seated(currentMatchForCourt(state, "c1")!)).toContain(ninaId);
  });

  it("a newcomer swapped in by hand graduates once that match is recorded", () => {
    let state = fillOpenCourts(baseState({ players: regulars(8, { gamesPlayed: 2 }), courts: TWO_COURTS, settings: { format: "doubles", courtCount: 2 } }));
    // Both courts full; Nina arrives and the organiser puts her straight in.
    state = addPlayers(state, { names: ["Nina"] });
    const ninaId = player(state, "Nina").id;
    const match = currentMatchForCourt(state, "c1")!;
    state = swapPlayerInMatch(state, { matchId: match.id, outPlayerId: match.teamA[0], inPlayerId: ninaId });
    expect(player(state, ninaId).newcomer).toBe(true);

    state = playCourt(state, "c1");
    const nina = player(state, ninaId);
    expect(nina.newcomer).toBe(false);
    expect(nina.gamesPlayed).toBe(1);
    // Field's lowest: court 2's players and the swapped-out regular, still on 2.
    expect(rankedGames(nina)).toBe(2);
    expect(nextUpQueue(state).find((u) => u.playerIds.includes(ninaId))?.tier).not.toBe("newcomer");
  });

  it("random swaps over many cycles never double-book, always form 2v2, keep newcomers first, and rebalance games once swapping stops", () => {
    const rand = mulberry32(42);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
    let state = fillOpenCourts(baseState({ players: regulars(11), courts: TWO_COURTS, settings: { format: "doubles", courtCount: 2 } }));
    let newcomerCount = 0;

    // 200 cycles with random manual swaps (and a newcomer arriving every
    // 40), then 60 cycles left to the scheduler alone. Courts alternate, as
    // they roughly would courtside.
    for (let step = 0; step < 260; step++) {
      if (step % 40 === 20) {
        newcomerCount += 1;
        state = fillOpenCourts(addPlayers(state, { names: [`New ${newcomerCount}`] }));
      }

      const courtId = step % 2 === 0 ? "c1" : "c2";
      const match = currentMatchForCourt(state, courtId);
      if (!match || match.winner !== null) continue;

      if (step < 200 && rand() < 0.5) {
        const out = pick(seated(match));
        const candidates = state.players.filter((p) => p.active && !seated(match).includes(p.id));
        if (candidates.length > 0) {
          state = swapPlayerInMatch(state, { matchId: match.id, outPlayerId: out, inPlayerId: pick(candidates).id });
        }
      }

      const queueBefore = nextUpQueue(state);
      const current = currentMatchForCourt(state, courtId)!;
      const otherCourt = currentMatchForCourt(state, courtId === "c1" ? "c2" : "c1");
      const otherOccupied = !!otherCourt && otherCourt.winner === null;
      state = playCourt(state, courtId, rand() < 0.5 ? "A" : "B", { random: rand });

      // Invariant: nobody is seated in two undecided matches.
      const live = ["c1", "c2"].map((c) => currentMatchForCourt(state, c)).filter((m): m is Match => !!m && m.winner === null);
      const liveIds = live.flatMap(seated);
      expect(new Set(liveIds).size).toBe(liveIds.length);

      // Invariant: every match is a clean 2v2 of distinct players.
      for (const m of live) {
        expect(m.teamA).toHaveLength(2);
        expect(m.teamB).toHaveLength(2);
        expect(new Set(seated(m)).size).toBe(4);
      }

      // Invariant: a newcomer who was waiting gets the next seat that opens.
      const next = currentMatchForCourt(state, courtId)!;
      if (next.id !== current.id && otherOccupied) {
        const waitingNewcomers = queueBefore.filter((u) => u.tier === "newcomer").flatMap((u) => u.playerIds);
        for (const id of waitingNewcomers) expect(seated(next)).toContain(id);
      }
    }

    // Swaps hand out extra games arbitrarily, but once they stop the queue
    // pulls everyone — regulars and graduated newcomers alike — back
    // within a couple of games of each other.
    const ranked = state.players.filter((p) => p.active && !p.newcomer).map(rankedGames);
    expect(Math.max(...ranked) - Math.min(...ranked)).toBeLessThanOrEqual(2);
    expect(newcomerCount).toBeGreaterThan(0);
  });
});

/** Tiny seeded PRNG so the randomized run is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
