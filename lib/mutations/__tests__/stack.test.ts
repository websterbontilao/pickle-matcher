import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, type Match, type Player, type SessionState } from "@/lib/schemas";
import { addPlayers, linkPlayers } from "@/lib/mutations/players";
import { currentMatchForCourt, fillOpenCourts, nextUpQueue, recordResult, startMatch } from "@/lib/mutations/rounds";
import { setRotation, setStackNewcomers, startSession } from "@/lib/mutations/settings";

function makePlayer(n: number, overrides: Partial<Player> = {}): Player {
  return {
    id: `s${n}`,
    name: `S${n}`,
    active: true,
    joinedAt: n,
    queuePosition: n,
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

/** Players s1..sN on one court, in stack mode, session started. */
function stackSession(count: number, overrides: Partial<Player>[] = []): SessionState {
  const players = Array.from({ length: count }, (_, i) => makePlayer(i + 1, overrides[i]));
  const state: SessionState = {
    ...EMPTY_SESSION_STATE,
    players,
    courts: [{ id: "c1", name: "Court 1" }],
    settings: { format: "doubles", courtCount: 1, resultEntry: "winner", rotation: "stack" },
  };
  return fillOpenCourts(startSession(state));
}

/** Keeps players who finish together in their match order at the back. */
const NO_SHUFFLE = { random: () => 0.9999 };

function current(state: SessionState): Match {
  return currentMatchForCourt(state, "c1")!;
}

/** Starts and records court 1's match, then lets the court refill. */
function play(state: SessionState, winner: "A" | "B"): SessionState {
  const match = current(state);
  state = fillOpenCourts(startMatch(state, { matchId: match.id }));
  return fillOpenCourts(recordResult(state, { matchId: match.id, winner }, NO_SHUFFLE));
}

const sorted = (ids: string[]) => [...ids].sort();
const lineup = (m: Match) => sorted([...m.teamA, ...m.teamB]);

describe("paddle stack", () => {
  it("seats players in stack order, 1st & 2nd vs 3rd & 4th", () => {
    const state = stackSession(8);
    expect(current(state).teamA).toEqual(["s1", "s2"]);
    expect(current(state).teamB).toEqual(["s3", "s4"]);
    expect(nextUpQueue(state).flatMap((u) => u.playerIds)).toEqual(["s5", "s6", "s7", "s8"]);
  });

  it("puts winners against winners and losers against losers, with teammates shuffled", () => {
    let state = stackSession(12);
    state = play(state, "A"); // s1 & s2 beat s3 & s4
    expect(lineup(current(state))).toEqual(["s5", "s6", "s7", "s8"]);
    state = play(state, "B"); // s7 & s8 beat s5 & s6
    expect(lineup(current(state))).toEqual(["s10", "s11", "s12", "s9"]);
    state = play(state, "A");

    const winners = current(state);
    expect(lineup(winners)).toEqual(["s1", "s2", "s7", "s8"]);
    expect(sorted(winners.teamA)).not.toEqual(["s1", "s2"]);
    expect(sorted(winners.teamA)).not.toEqual(["s7", "s8"]);

    state = play(state, "A");
    const losers = current(state);
    expect(lineup(losers)).toEqual(["s3", "s4", "s5", "s6"]);
    expect(sorted(losers.teamA)).not.toEqual(["s3", "s4"]);
    expect(sorted(losers.teamA)).not.toEqual(["s5", "s6"]);
  });

  it("ignores skill ratings and fairness rules", () => {
    const state = stackSession(8, [{ skillRating: 6 }, { skillRating: 6 }, {}, {}, { consecutiveSitOuts: 9 }]);
    expect(current(state).teamA).toEqual(["s1", "s2"]);
    expect(current(state).teamB).toEqual(["s3", "s4"]);
  });

  it("plays whoever has waited longest when no winners or losers can be matched up", () => {
    let state = stackSession(6);
    state = play(state, "A"); // s5, s6 waited; s1 & s2 won, s3 & s4 lost
    expect(sorted(current(state).teamA)).toEqual(["s5", "s6"]);
    expect(sorted(current(state).teamB)).toEqual(["s1", "s2"]);
  });

  it("never splits a linked pair", () => {
    let state = stackSession(12);
    state = linkPlayers(state, { aId: "s9", bId: "s10" });
    state = play(state, "A");
    state = play(state, "A");
    const m = current(state);
    expect(lineup(m)).toEqual(["s10", "s11", "s12", "s9"]);
    const linkedTeam = m.teamA.includes("s9") ? m.teamA : m.teamB;
    expect(sorted(linkedTeam)).toEqual(["s10", "s9"]);
  });

  it("puts a newcomer at the back of the stack by default", () => {
    let state = stackSession(8);
    state = addPlayers(state, { names: ["Gus"] });
    const gus = state.players.find((p) => p.name === "Gus")!;
    expect(nextUpQueue(state).at(-1)!.playerIds).toEqual([gus.id]);
    state = play(state, "A");
    expect(lineup(current(state))).not.toContain(gus.id);
  });

  it("can let a newcomer play the next match instead", () => {
    let state = setStackNewcomers(stackSession(8), { stackNewcomers: "next" });
    state = addPlayers(state, { names: ["Gus"] });
    const gus = state.players.find((p) => p.name === "Gus")!;
    expect(nextUpQueue(state)[0].playerIds).toEqual([gus.id]);
    state = play(state, "A");
    expect(lineup(current(state))).toContain(gus.id);
  });

  it("locks the rotation once the session starts", () => {
    const started = stackSession(8);
    expect(setRotation(started, { rotation: "casual" })).toBe(started);
    const setup = { ...started, sessionStarted: false };
    expect(setRotation(setup, { rotation: "casual" }).settings.rotation).toBe("casual");
  });
});
