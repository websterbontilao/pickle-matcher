import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, type Match, type Player, type SessionState } from "@/lib/schemas";
import { addPlayers, removePlayer } from "@/lib/mutations/players";
import { currentMatchForCourt, fillOpenCourts, recordResult, startMatch } from "@/lib/mutations/rounds";
import { setFormat, startSession, stopSession } from "@/lib/mutations/settings";
import {
  clearPlannedMatches,
  forecast,
  nextUpOrder,
  swapInForecast,
  unlockPlannedMatch,
  type ForecastMatch,
} from "@/lib/mutations/forecast";

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
    ...overrides,
  };
}

const ONE_COURT = [{ id: "c1", name: "Court 1" }];
const TWO_COURTS = [
  { id: "c1", name: "Court 1" },
  { id: "c2", name: "Court 2" },
];

function regulars(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => makePlayer({ id: `r${i + 1}`, name: `R${i + 1}`, queuePosition: i + 1 }));
}

/** A not-yet-started session in setup. */
function setupState(players: Player[], overrides: Partial<SessionState> = {}): SessionState {
  return {
    ...EMPTY_SESSION_STATE,
    courts: ONE_COURT,
    settings: { format: "doubles", courtCount: 1 },
    players,
    ...overrides,
  };
}

const NO_SHUFFLE = { random: () => 0.9999 };

function seated(m: { teamA: string[]; teamB: string[] }): string[] {
  return [...m.teamA, ...m.teamB];
}

function lineup(m: { teamA: string[]; teamB: string[] }) {
  return { teamA: m.teamA, teamB: m.teamB };
}

/** Start → record → refill, the same pipeline the UI drives. */
function playCourt(state: SessionState, courtId: string): SessionState {
  const match = currentMatchForCourt(state, courtId)!;
  const started = startMatch(state, { matchId: match.id });
  return fillOpenCourts(recordResult(started, { matchId: match.id, winner: "A" }, NO_SHUFFLE));
}

/** Every swap mutation runs through fillOpenCourts in the app. */
function swap(state: SessionState, matchIndex: number, outPlayerId: string, inPlayerId: string): SessionState {
  return fillOpenCourts(swapInForecast(state, { matchIndex, outPlayerId, inPlayerId }));
}

describe("forecast", () => {
  it("previews the opening matches before the session starts, exactly as starting will seat them", () => {
    const state = setupState(regulars(10));
    const preview = forecast(state);
    expect(preview).toHaveLength(5);

    const started = fillOpenCourts(startSession(state));
    expect(lineup(currentMatchForCourt(started, "c1")!)).toEqual(lineup(preview[0]));
  });

  it("starts after the matches already seated on courts", () => {
    const state = fillOpenCourts(startSession(setupState(regulars(8))));
    const onCourt = seated(currentMatchForCourt(state, "c1")!);
    const next = forecast(state);
    expect(seated(next[0]).some((id) => onCourt.includes(id))).toBe(false);
  });

  it("predicts what actually gets seated when courts finish in the assumed order", () => {
    let state = fillOpenCourts(startSession(setupState(regulars(10), { courts: TWO_COURTS })));
    const predicted = forecast(state);
    const actual: Match[] = [];
    for (const courtId of ["c1", "c2", "c1"]) {
      const before = state.matches.length;
      state = playCourt(state, courtId);
      actual.push(...state.matches.slice(before));
    }
    expect(actual.map(lineup)).toEqual(predicted.slice(0, actual.length).map(lineup));
  });

  it("marks matches of players waiting right now as likely, and ones depending on finishers as tentative", () => {
    const state = fillOpenCourts(startSession(setupState(regulars(10))));
    const confidences = forecast(state).map((m) => m.confidence);
    expect(confidences[0]).toBe("likely");
    expect(confidences.slice(1)).toContain("tentative");
  });

  it("doesn't call a match likely if its players first have to play an earlier forecast match", () => {
    // 8 players, 1 court: the 4 waiting play match 1, then come back for match 3.
    const state = fillOpenCourts(startSession(setupState(regulars(8))));
    const f = forecast(state);
    expect(f[0].confidence).toBe("likely");
    expect(seated(f[2]).sort()).toEqual(seated(f[0]).sort());
    expect(f[2].confidence).toBe("tentative");
  });

  it("puts a newcomer in the very next forecast match", () => {
    const state = fillOpenCourts(startSession(setupState(regulars(10))));
    const withGus = addPlayers(state, { names: ["Gus"] });
    const gus = withGus.players.find((p) => p.name === "Gus")!;
    expect(seated(forecast(withGus)[0])).toContain(gus.id);
  });

  it("is empty when there aren't enough players for a match", () => {
    expect(forecast(setupState(regulars(3)))).toEqual([]);
  });
});

describe("swapping in the forecast", () => {
  function started(count = 12): SessionState {
    return fillOpenCourts(startSession(setupState(regulars(count))));
  }

  it("locks every match up to and including the edited one as planned", () => {
    const state = started(30);
    const before = forecast(state);
    const inForecastOrOnCourt = new Set([...before.flatMap(seated), ...seated(currentMatchForCourt(state, "c1")!)]);
    const outsider = state.players.find((p) => !inForecastOrOnCourt.has(p.id))!;
    const out = before[2].teamA[0];

    const next = swap(state, 2, out, outsider.id);
    expect(next.plannedMatches).toHaveLength(3);
    const after = forecast(next);
    expect(after.slice(0, 3).map((m) => m.confidence)).toEqual(["planned", "planned", "planned"]);
    expect(seated(after[2])).toContain(outsider.id);
    expect(seated(after[2])).not.toContain(out);
    expect(after.slice(0, 2).map(lineup)).toEqual(before.slice(0, 2).map(lineup));
  });

  it("switches teams within a forecast match", () => {
    const state = started();
    const m = forecast(state)[0];
    const next = swap(state, 0, m.teamA[0], m.teamB[0]);
    const after = forecast(next)[0];
    expect(after.teamA).toContain(m.teamB[0]);
    expect(after.teamB).toContain(m.teamA[0]);
  });

  it("swaps two players between forecast matches, using the incoming player's nearest appearance", () => {
    const state = started(16);
    const before = forecast(state);
    const a = before[0].teamA[0];
    const b = seated(before[3]).find((id) => !seated(before[0]).includes(id) && !seated(before[1]).includes(id) && !seated(before[2]).includes(id))!;
    const next = swap(state, 0, a, b);
    expect(next.plannedMatches).toHaveLength(4);
    const after = forecast(next);
    expect(seated(after[0])).toContain(b);
    expect(seated(after[3])).toContain(a);
    expect(seated(after[3])).not.toContain(b);
  });

  it("seats planned matches exactly as locked when courts open", () => {
    let state = started();
    const m = forecast(state)[1];
    state = swap(state, 1, m.teamA[0], m.teamB[1]);
    const plans = state.plannedMatches.map(lineup);

    state = playCourt(state, "c1");
    expect(lineup(currentMatchForCourt(state, "c1")!)).toEqual(plans[0]);
    state = playCourt(state, "c1");
    expect(lineup(currentMatchForCourt(state, "c1")!)).toEqual(plans[1]);
    expect(state.plannedMatches).toEqual([]);
  });

  it("works before the session starts, and starting seats the plan", () => {
    const state = setupState(regulars(8));
    const m = forecast(state)[0];
    const next = swap(state, 0, m.teamA[0], m.teamB[0]);
    const plan = next.plannedMatches[0];
    const live = fillOpenCourts(startSession(next));
    expect(lineup(currentMatchForCourt(live, "c1")!)).toEqual(lineup(plan));
  });

  it("rejects a swap that couldn't happen as shown — the player would still be on another court", () => {
    const state = fillOpenCourts(startSession(setupState(regulars(8), { courts: TWO_COURTS })));
    const onCourt2 = currentMatchForCourt(state, "c2")!.teamA[0];
    const c1 = currentMatchForCourt(state, "c1")!;
    const started = startMatch(startMatch(state, { matchId: c1.id }), { matchId: currentMatchForCourt(state, "c2")!.id });
    // Court 1 started first, so it's assumed to finish first — court 2's
    // players are still mid-match when forecast match 0 is seated.
    const first = forecast(started)[0];
    const outId = seated(first).find((id) => !currentMatchForCourt(state, "c2")!.teamA.includes(id) && !currentMatchForCourt(state, "c2")!.teamB.includes(id))!;
    expect(swapInForecast(started, { matchIndex: 0, outPlayerId: outId, inPlayerId: onCourt2 })).toBe(started);
  });

  it("ignores swaps for a player who isn't in that match", () => {
    const state = started();
    const f = forecast(state);
    expect(swapInForecast(state, { matchIndex: 0, outPlayerId: f[1].teamA[0], inPlayerId: f[0].teamA[0] })).toBe(state);
  });
});

describe("planned matches", () => {
  function plannedState(): SessionState {
    const state = fillOpenCourts(startSession(setupState(regulars(12))));
    const m = forecast(state)[2];
    return swap(state, 2, m.teamA[0], m.teamB[0]);
  }

  it("take precedence over a newcomer, who goes first among the calculated matches", () => {
    const state = addPlayers(plannedState(), { names: ["Gus"] });
    const gus = state.players.find((p) => p.name === "Gus")!;
    const f = forecast(state);
    expect(f.slice(0, 3).some((m) => seated(m).includes(gus.id))).toBe(false);
    expect(seated(f[3])).toContain(gus.id);
  });

  it("refill a planned player who becomes unavailable from the queue, keeping the rest of the plan", () => {
    const state = plannedState();
    const plan = state.plannedMatches[0];
    const dropped = plan.teamA[0];
    const withGus = addPlayers(removePlayer(state, { id: dropped }), { names: ["Gus"] });
    const gus = withGus.players.find((p) => p.name === "Gus")!;

    const live = playCourt(withGus, "c1");
    const m = currentMatchForCourt(live, "c1")!;
    expect(m.teamA).toEqual([gus.id, plan.teamA[1]]);
    expect(m.teamB).toEqual(plan.teamB);
    expect(live.plannedMatches).toHaveLength(2);
  });

  it("warn when they override a fairness rule, without blocking it", () => {
    // 6 players, 1 court: after the first match the two who sat out are
    // guaranteed a spot. Plan a rematch of the first four instead.
    let state = fillOpenCourts(startSession(setupState(regulars(6))));
    const firstFour = currentMatchForCourt(state, "c1")!;
    const f = forecast(state);
    const benchedPair = seated(f[0]).filter((id) => !seated(firstFour).includes(id));
    const replacements = seated(firstFour).filter((id) => !seated(f[0]).includes(id));
    state = swap(state, 0, benchedPair[0], replacements[0]);
    const conflicts: ForecastMatch["ruleConflicts"] = forecast(state)[0].ruleConflicts;
    expect(conflicts).toContainEqual({ playerId: benchedPair[0], rule: "guaranteed" });
  });

  it("don't flag players the scheduler would have picked anyway, or a newcomer arriving after the plan", () => {
    let state = fillOpenCourts(startSession(setupState(regulars(6))));
    const m = forecast(state)[0];
    state = swap(state, 0, m.teamA[0], m.teamB[0]);
    expect(forecast(state)[0].ruleConflicts).toEqual([]);
    expect(forecast(addPlayers(state, { names: ["Gus"] }))[0].ruleConflicts).toEqual([]);
  });

  it("put planned players first in Next Up, in plan order, so it agrees with the Upcoming tab", () => {
    // 10 players, 1 court: 6 waiting. Pull the last two waiting players
    // into forecast match 0 — Next Up should now lead with them.
    let state = fillOpenCourts(startSession(setupState(regulars(10))));
    const before = nextUpOrder(state).flatMap((u) => u.playerIds);
    const m = forecast(state)[0];
    const [lateA, lateB] = before.slice(-2);
    state = swap(swap(state, 0, m.teamA[0], lateA), 0, m.teamA[1], lateB);

    const after = nextUpOrder(state);
    const plan = state.plannedMatches[0];
    const plannedWaiting = after.filter((u) => u.plannedIndex === 0).flatMap((u) => u.playerIds);
    expect(plannedWaiting.every((id) => [...plan.teamA, ...plan.teamB].includes(id))).toBe(true);
    expect(after.slice(0, plannedWaiting.length).flatMap((u) => u.playerIds)).toEqual(plannedWaiting);
    expect(plannedWaiting).toEqual(expect.arrayContaining([lateA, lateB]));
    // Planned units lead in plan order; unplanned ones follow.
    const indexes = after.map((u) => u.plannedIndex ?? Infinity);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("unlock releases that plan and every plan after it", () => {
    const state = plannedState();
    const [, second] = state.plannedMatches;
    const next = unlockPlannedMatch(state, { id: second.id });
    expect(next.plannedMatches).toEqual(state.plannedMatches.slice(0, 1));
  });

  it("clear all removes every plan", () => {
    expect(clearPlannedMatches(plannedState()).plannedMatches).toEqual([]);
  });

  it("are cleared by a format change but kept by stopping the session", () => {
    const state = setupState(regulars(8));
    const m = forecast(state)[0];
    const planned = swap(state, 0, m.teamA[0], m.teamB[0]);
    expect(setFormat(planned, { format: "singles" }).plannedMatches).toEqual([]);
    expect(setFormat(planned, { format: "doubles" }).plannedMatches).toHaveLength(1);

    const live = fillOpenCourts(startSession(swap(state, 1, forecast(state)[1].teamA[0], forecast(state)[1].teamB[0])));
    expect(live.plannedMatches).toHaveLength(1);
    expect(stopSession(live).plannedMatches).toHaveLength(1);
  });
});
