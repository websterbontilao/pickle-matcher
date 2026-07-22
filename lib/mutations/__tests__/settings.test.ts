import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, type Player, type SessionState } from "@/lib/schemas";
import { fillOpenCourts, startMatch } from "@/lib/mutations/rounds";
import { anyMatchStarted, hasSessionStarted, startSession, stopSession } from "@/lib/mutations/settings";

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
    courts: [{ id: "c1", name: "Court 1" }],
    settings: { format: "doubles", courtCount: 1 },
    ...overrides,
  };
}

describe("stopSession", () => {
  it("reverts sessionStarted and clears auto-filled matches when nothing has started playing", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    let state = baseState({ players });
    state = startSession(state);
    state = fillOpenCourts(state);
    expect(state.matches.length).toBeGreaterThan(0);

    state = stopSession(state);

    expect(hasSessionStarted(state)).toBe(false);
    expect(state.matches).toHaveLength(0);
    expect(state.sitOuts).toHaveLength(0);
    expect(state.matchSequence).toBe(0);
  });

  it("no-ops once any match has actually been started", () => {
    const players = Array.from({ length: 4 }, () => makePlayer());
    let state = baseState({ players });
    state = startSession(state);
    state = fillOpenCourts(state);
    const match = state.matches[0];
    state = startMatch(state, { matchId: match.id });
    expect(anyMatchStarted(state)).toBe(true);

    const result = stopSession(state);

    expect(result).toBe(state);
  });

  it("no-ops if the session was never started", () => {
    const state = baseState();

    const result = stopSession(state);

    expect(result).toBe(state);
  });
});
