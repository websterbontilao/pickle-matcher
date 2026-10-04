import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, SessionSettingsSchema, type Player, type SessionState } from "@/lib/schemas";
import { changeResult, currentMatchForCourt, fillOpenCourts, matchHistory, recordResult, startMatch } from "@/lib/mutations/rounds";
import { setResultEntry, startSession } from "@/lib/mutations/settings";
import { addCourt } from "@/lib/mutations/courts";

function makePlayer(i: number): Player {
  return {
    id: `r${i}`,
    name: `R${i}`,
    active: true,
    joinedAt: i,
    queuePosition: i,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    consecutiveGames: 0,
    consecutiveSitOuts: 0,
    newcomer: false,
    gamesCredit: 0,
    skillRating: 2,
  };
}

/** A started session with a started match on court 1. */
function liveMatch(): { state: SessionState; matchId: string } {
  let state: SessionState = fillOpenCourts(
    startSession({
      ...EMPTY_SESSION_STATE,
      courts: [{ id: "c1", name: "Court 1" }],
      players: [1, 2, 3, 4, 5, 6].map(makePlayer),
    }),
  );
  const matchId = currentMatchForCourt(state, "c1")!.id;
  state = startMatch(state, { matchId });
  return { state, matchId };
}

const NO_SHUFFLE = { random: () => 0.9999 };

function player(state: SessionState, id: string): Player {
  return state.players.find((p) => p.id === id)!;
}

describe("result entry setting", () => {
  it("defaults to picking the winner, including for saved sessions from before the setting", () => {
    expect(EMPTY_SESSION_STATE.settings.resultEntry).toBe("winner");
    expect(SessionSettingsSchema.parse({ format: "doubles", courtCount: 1 }).resultEntry).toBe("winner");
  });

  it("survives changing the courts", () => {
    const scored = setResultEntry({ ...EMPTY_SESSION_STATE }, { resultEntry: "score" });
    expect(addCourt(scored).settings.resultEntry).toBe("score");
  });

  it("can be changed mid-session", () => {
    const { state } = liveMatch();
    expect(setResultEntry(state, { resultEntry: "score" }).settings.resultEntry).toBe("score");
  });
});

describe("recording by score", () => {
  it("makes the higher score the winner and keeps the score in match history", () => {
    const { state, matchId } = liveMatch();
    const next = recordResult(state, { matchId, score: { a: 7, b: 11 } }, NO_SHUFFLE);
    const decided = next.matches.find((m) => m.id === matchId)!;
    expect(decided.winner).toBe("B");
    expect(decided.score).toEqual({ a: 7, b: 11 });
    expect(matchHistory(next)[0].score).toEqual({ a: 7, b: 11 });
    for (const id of decided.teamB) expect(player(next, id).wins).toBe(1);
    for (const id of decided.teamA) expect(player(next, id).losses).toBe(1);
  });

  it("rejects a tie or an invalid score", () => {
    const { state, matchId } = liveMatch();
    expect(recordResult(state, { matchId, score: { a: 9, b: 9 } })).toBe(state);
    expect(recordResult(state, { matchId, score: { a: -1, b: 11 } })).toBe(state);
    expect(recordResult(state, { matchId, score: { a: 10.5, b: 11 } })).toBe(state);
  });

  it("stores no score when the winner is just picked", () => {
    const { state, matchId } = liveMatch();
    const next = recordResult(state, { matchId, winner: "A" }, NO_SHUFFLE);
    expect(next.matches.find((m) => m.id === matchId)!.score).toBeUndefined();
  });
});

describe("correcting a result", () => {
  it("updates just the score when the winner stays the same — stats untouched", () => {
    const { state, matchId } = liveMatch();
    const recorded = recordResult(state, { matchId, score: { a: 11, b: 4 } }, NO_SHUFFLE);
    const corrected = changeResult(recorded, { matchId, score: { a: 11, b: 9 } });
    expect(corrected.matches.find((m) => m.id === matchId)!.score).toEqual({ a: 11, b: 9 });
    expect(corrected.players).toBe(recorded.players);
  });

  it("flips the winner and its stats when the corrected score does", () => {
    const { state, matchId } = liveMatch();
    const recorded = recordResult(state, { matchId, score: { a: 11, b: 4 } }, NO_SHUFFLE);
    const m = recorded.matches.find((x) => x.id === matchId)!;
    const corrected = changeResult(recorded, { matchId, score: { a: 9, b: 11 } });
    const after = corrected.matches.find((x) => x.id === matchId)!;
    expect(after.winner).toBe("B");
    expect(after.score).toEqual({ a: 9, b: 11 });
    for (const id of m.teamA) expect(player(corrected, id)).toMatchObject({ wins: 0, losses: 1 });
    for (const id of m.teamB) expect(player(corrected, id)).toMatchObject({ wins: 1, losses: 0 });
  });

  it("clears the score when the other winner is picked, so the two can't contradict", () => {
    const { state, matchId } = liveMatch();
    const recorded = recordResult(state, { matchId, score: { a: 11, b: 4 } }, NO_SHUFFLE);
    const corrected = changeResult(recorded, { matchId, winner: "B" });
    const after = corrected.matches.find((x) => x.id === matchId)!;
    expect(after.winner).toBe("B");
    expect(after.score).toBeUndefined();
  });

  it("ignores a tied corrected score", () => {
    const { state, matchId } = liveMatch();
    const recorded = recordResult(state, { matchId, score: { a: 11, b: 4 } }, NO_SHUFFLE);
    expect(changeResult(recorded, { matchId, score: { a: 8, b: 8 } })).toBe(recorded);
  });
});
