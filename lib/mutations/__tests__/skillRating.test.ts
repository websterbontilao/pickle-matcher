import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_STATE, PlayerSchema, type Match, type Player, type SessionState } from "@/lib/schemas";
import { addPlayers, linkPlayers, setSkillRating } from "@/lib/mutations/players";
import { currentMatchForCourt, fillOpenCourts, nextUpQueue, startMatch } from "@/lib/mutations/rounds";
import { startSession } from "@/lib/mutations/settings";
import { forecast, swapInForecast } from "@/lib/mutations/forecast";
import { formBestDoublesSplit } from "@/lib/engine/pairing";
import { buildPairHistory } from "@/lib/engine/pairHistory";
import { imbalanceCause, ratingLookup, unevenTeams } from "@/lib/engine/balance";
import { getSchedulableUnits } from "@/lib/engine/units";

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

function rated(ratings: number[]): Player[] {
  return ratings.map((skillRating, i) => makePlayer({ id: `r${i + 1}`, queuePosition: i + 1, skillRating }));
}

function setupState(players: Player[], overrides: Partial<SessionState> = {}): SessionState {
  return {
    ...EMPTY_SESSION_STATE,
    courts: [{ id: "c1", name: "Court 1" }],
    settings: { format: "doubles", courtCount: 1 },
    players,
    ...overrides,
  };
}

function seated(m: { teamA: string[]; teamB: string[] }): string[] {
  return [...m.teamA, ...m.teamB];
}

function sorted(ids: string[]): string[] {
  return [...ids].sort();
}

function pastMatch(teamA: string[], teamB: string[], n: number): Match {
  return { id: `past-${n}`, roundNumber: n, courtId: "c1", teamA, teamB, winner: "A", startedAt: 0, timestamp: n };
}

describe("skill rating", () => {
  it("defaults to 2.0 for new players and for saved players from before ratings existed", () => {
    const state = addPlayers(setupState([]), { names: ["Ana"] });
    expect(state.players[0].skillRating).toBe(2);
    const legacy: Partial<Player> = { ...makePlayer() };
    delete legacy.skillRating;
    expect(PlayerSchema.parse(legacy).skillRating).toBe(2);
  });

  it("snaps to half steps within 2.0–6.0", () => {
    const state = setupState(rated([2]));
    expect(setSkillRating(state, { id: "r1", skillRating: 3.3 }).players[0].skillRating).toBe(3.5);
    expect(setSkillRating(state, { id: "r1", skillRating: 9 }).players[0].skillRating).toBe(6);
    expect(setSkillRating(state, { id: "r1", skillRating: 1 })).toBe(state);
  });
});

describe("balanced team splits", () => {
  it("pairs strong with weak so team averages are as close as possible", () => {
    const players = rated([4, 4, 2, 2]);
    const { teamA, teamB } = formBestDoublesSplit(getSchedulableUnits(players), buildPairHistory([]), ratingLookup(players));
    expect(unevenTeams({ teamA, teamB }, ratingLookup(players))).toBeNull();
    expect(teamA.some((id) => id === "r1" || id === "r2")).toBe(true);
    expect(teamB.some((id) => id === "r1" || id === "r2")).toBe(true);
  });

  it("puts balance ahead of partner variety", () => {
    const players = rated([4, 4, 2, 2]);
    // r1+r3 and r1+r4 have both partnered many times; only the lopsided
    // r1+r2 split is "fresh" — balance still wins.
    const history = buildPairHistory([
      pastMatch(["r1", "r3"], ["r2", "r4"], 1),
      pastMatch(["r1", "r4"], ["r2", "r3"], 2),
      pastMatch(["r1", "r3"], ["r2", "r4"], 3),
    ]);
    const split = formBestDoublesSplit(getSchedulableUnits(players), history, ratingLookup(players));
    expect(sorted(split.teamA)).not.toEqual(["r1", "r2"]);
    expect(sorted(split.teamB)).not.toEqual(["r1", "r2"]);
  });

  it("uses partner variety to choose among equally balanced splits", () => {
    // r1+r3 vs r2+r4 and r1+r4 vs r2+r3 are both perfectly even; r1+r3
    // have partnered before, so the fresh pairing wins.
    const players = rated([3, 3, 2.5, 2.5]);
    const history = buildPairHistory([pastMatch(["r1", "r3"], ["r2", "r4"], 1)]);
    const split = formBestDoublesSplit(getSchedulableUnits(players), history, ratingLookup(players));
    const r1Team = split.teamA.includes("r1") ? split.teamA : split.teamB;
    expect(sorted(r1Team)).toEqual(["r1", "r4"]);
  });

  it("never changes who plays — only how they're split", () => {
    const flat = setupState(rated([2, 2, 2, 2, 2, 2, 2, 2]));
    const skewed = setupState(rated([6, 2, 2, 2, 2, 6, 6, 6]));
    expect(nextUpQueue(skewed).map((u) => u.playerIds)).toEqual(nextUpQueue(flat).map((u) => u.playerIds));
    const a = currentMatchForCourt(fillOpenCourts(startSession(flat)), "c1")!;
    const b = currentMatchForCourt(fillOpenCourts(startSession(skewed)), "c1")!;
    expect(sorted(seated(b))).toEqual(sorted(seated(a)));
    expect(forecast(skewed).map((m) => sorted(seated(m)))).toEqual(forecast(flat).map((m) => sorted(seated(m))));
  });
});

describe("uneven matches", () => {
  const ratingOf = ratingLookup(rated([3.5, 2, 2, 2.5]));

  it("are flagged when team averages differ by 0.5 or more", () => {
    expect(unevenTeams({ teamA: ["r1", "r4"], teamB: ["r2", "r3"] }, ratingOf)).toEqual({ teamA: 3, teamB: 2 });
    expect(unevenTeams({ teamA: ["r1", "r2"], teamB: ["r3", "r4"] }, ratingOf)).toEqual({ teamA: 2.75, teamB: 2.25 });
    expect(unevenTeams({ teamA: ["r1", "r3"], teamB: ["r2", "r4"] }, ratingOf)).toEqual({ teamA: 2.75, teamB: 2.25 });
  });

  it("aren't flagged below 0.5", () => {
    const close = ratingLookup(rated([3, 2.5, 2.5, 2.5]));
    expect(unevenTeams({ teamA: ["r1", "r2"], teamB: ["r3", "r4"] }, close)).toBeNull();
  });

  it("in singles compare the two players directly", () => {
    expect(unevenTeams({ teamA: ["r1"], teamB: ["r4"] }, ratingOf)).toEqual({ teamA: 3.5, teamB: 2.5 });
    expect(unevenTeams({ teamA: ["r2"], teamB: ["r4"] }, ratingOf)).toEqual({ teamA: 2, teamB: 2.5 });
    expect(unevenTeams({ teamA: ["r2"], teamB: ["r3"] }, ratingOf)).toBeNull();
  });

  it("are still flagged when a linked pair rules out a fairer split", () => {
    let state = setupState(rated([4, 4, 2, 2]));
    state = linkPlayers(state, { aId: "r1", bId: "r2" });
    const m = currentMatchForCourt(fillOpenCourts(startSession(state)), "c1")!;
    expect(unevenTeams(m, ratingLookup(state.players))).not.toBeNull();
  });
});

describe("who causes an uneven match", () => {
  it("names a single player rated well above the rest", () => {
    const ratingOf = ratingLookup(rated([4, 2, 2, 2]));
    expect(imbalanceCause({ teamA: ["r1", "r2"], teamB: ["r3", "r4"] }, ratingOf)).toEqual({ kind: "above", playerIds: ["r1"] });
  });

  it("names a single player rated well below the rest", () => {
    const ratingOf = ratingLookup(rated([3.5, 3.5, 4, 2]));
    expect(imbalanceCause({ teamA: ["r1", "r2"], teamB: ["r3", "r4"] }, ratingOf)).toEqual({ kind: "below", playerIds: ["r4"] });
  });

  it("calls out strong players stacked on the same team", () => {
    const ratingOf = ratingLookup(rated([4, 4, 2, 2]));
    expect(imbalanceCause({ teamA: ["r3", "r4"], teamB: ["r1", "r2"] }, ratingOf)).toEqual({ kind: "stacked", playerIds: ["r1", "r2"] });
  });

  it("names a strong player against a weak one when both pull the teams apart", () => {
    const ratingOf = ratingLookup(rated([4, 3, 2, 3]));
    expect(imbalanceCause({ teamA: ["r1", "r2"], teamB: ["r3", "r4"] }, ratingOf)).toEqual({
      kind: "spread",
      strongIds: ["r1"],
      weakIds: ["r3"],
    });
  });

  it("in singles just names both players", () => {
    const ratingOf = ratingLookup(rated([4, 2]));
    expect(imbalanceCause({ teamA: ["r1"], teamB: ["r2"] }, ratingOf)).toEqual({ kind: "singles", playerIds: ["r1", "r2"] });
  });
});

describe("changing a rating", () => {
  function live(ratings: number[]): SessionState {
    return fillOpenCourts(startSession(setupState(rated(ratings))));
  }

  it("rebalances a seated match that hasn't started, keeping the same four players", () => {
    let state = live([2, 2, 2, 2, 2, 2]);
    const before = currentMatchForCourt(state, "c1")!;
    const [x, y] = before.teamA;
    state = setSkillRating(setSkillRating(state, { id: x, skillRating: 5 }), { id: y, skillRating: 5 });
    const after = currentMatchForCourt(state, "c1")!;
    expect(after.id).toBe(before.id);
    expect(sorted(seated(after))).toEqual(sorted(seated(before)));
    expect(unevenTeams(after, ratingLookup(state.players))).toBeNull();
  });

  it("never touches a match that has started", () => {
    let state = live([2, 2, 2, 2, 2, 2]);
    const m = currentMatchForCourt(state, "c1")!;
    state = startMatch(state, { matchId: m.id });
    const [x, y] = m.teamA;
    state = setSkillRating(setSkillRating(state, { id: x, skillRating: 5 }), { id: y, skillRating: 5 });
    const after = currentMatchForCourt(state, "c1")!;
    expect(after.teamA).toEqual(m.teamA);
    expect(unevenTeams(after, ratingLookup(state.players))).not.toBeNull();
  });

  it("rebalances calculated forecast matches but leaves planned matches as locked", () => {
    let state = live([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    const f = forecast(state);
    // Lock match 1 only, then make its team A strong.
    state = swapInForecast(state, { matchIndex: 0, outPlayerId: f[0].teamA[0], inPlayerId: f[0].teamB[0] });
    const plan = state.plannedMatches[0];
    const [x, y] = plan.teamA;
    state = setSkillRating(setSkillRating(state, { id: x, skillRating: 5 }), { id: y, skillRating: 5 });

    const after = forecast(state);
    expect(after[0].teamA).toEqual(plan.teamA);
    expect(unevenTeams(after[0], ratingLookup(state.players))).not.toBeNull();
    const laterWithX = after.slice(1).find((m) => seated(m).includes(x) && seated(m).includes(y));
    if (laterWithX) expect(unevenTeams(laterWithX, ratingLookup(state.players))).toBeNull();
  });

  it("leaves seated matches alone in singles — there are no teams to rebalance", () => {
    let state = fillOpenCourts(startSession(setupState(rated([2, 2, 2]), { settings: { format: "singles", courtCount: 1 } })));
    const m = currentMatchForCourt(state, "c1")!;
    state = setSkillRating(state, { id: m.teamA[0], skillRating: 4 });
    expect(currentMatchForCourt(state, "c1")).toEqual(m);
  });
});
