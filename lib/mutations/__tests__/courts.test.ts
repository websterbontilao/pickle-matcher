import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, type SessionState } from "@/lib/schemas";
import { addCourt, removeCourt, renameCourt } from "@/lib/mutations/courts";

function baseState(overrides: Partial<SessionState> = {}): SessionState {
  return { ...EMPTY_SESSION_STATE, courts: [{ id: "c1", name: "Court 1" }], ...overrides };
}

describe("addCourt", () => {
  it("adds exactly one court per call and picks a name that doesn't collide", () => {
    let state = baseState();
    state = addCourt(state);
    expect(state.courts).toHaveLength(2);

    // Simulate a renamed court that would otherwise collide with the next auto-generated name.
    state = { ...state, courts: [...state.courts, { id: "manual", name: "Court 3" }] };
    state = addCourt(state);
    expect(state.courts.map((c) => c.name)).toEqual(["Court 1", "Court 2", "Court 3", "Court 4"]);
  });
});

describe("renameCourt", () => {
  it("no-ops when the new name collides with another court (case-insensitive)", () => {
    let state = baseState();
    state = addCourt(state); // Court 1, Court 2
    const secondCourtId = state.courts[1].id;

    const renamed = renameCourt(state, { id: secondCourtId, name: "court 1" });

    expect(renamed).toBe(state);
  });

  it("renames when the name is unique", () => {
    let state = baseState();
    state = addCourt(state);
    const secondCourtId = state.courts[1].id;

    const renamed = renameCourt(state, { id: secondCourtId, name: "Back Court" });

    expect(renamed.courts.find((c) => c.id === secondCourtId)?.name).toBe("Back Court");
  });

  it("still allows renaming after the session has started (cosmetic only)", () => {
    const started = baseState({ sessionStarted: true });

    const renamed = renameCourt(started, { id: "c1", name: "Center Court" });

    expect(renamed.courts.find((c) => c.id === "c1")?.name).toBe("Center Court");
  });
});

describe("session lock", () => {
  it("addCourt no-ops once the session has started", () => {
    const started = baseState({ sessionStarted: true });

    const result = addCourt(started);

    expect(result).toBe(started);
  });

  it("removeCourt no-ops once the session has started", () => {
    let state = baseState();
    state = addCourt(state); // Court 1, Court 2
    const started = { ...state, sessionStarted: true };

    const result = removeCourt(started, { id: started.courts[1].id });

    expect(result).toBe(started);
  });
});
