import type { Match, PlannedMatch, SessionState } from "@/lib/schemas";
import { busyPlayerIds, generateNextMatchForCourt } from "@/lib/engine/generateNextMatch";
import type { RankedUnit, RuleConflict } from "@/lib/engine/types";
import { applyGeneratedMatch, currentMatchForCourt, nextUpQueue, recordResult } from "./rounds";

export const FORECAST_LENGTH = 5;

export type ForecastConfidence = "likely" | "tentative" | "planned";

export interface ForecastMatch {
  teamA: string[];
  teamB: string[];
  confidence: ForecastConfidence;
  /** The planned match this entry comes from, or null if calculated. */
  plannedMatchId: string | null;
  ruleConflicts: RuleConflict[];
}

/** Keeps players who finish together in their current order when sent to
 * the back of the queue, instead of recordResult's random reshuffle — so
 * the forecast is stable rather than flickering between renders. */
const KEEP_ORDER = { random: () => 0.9999 };

/** The court whose current match is assumed to finish next: started
 * matches in the order they started, then not-yet-started ones in the
 * order they were created. */
function nextToFinish(state: SessionState): Match | undefined {
  const current = state.courts
    .map((c) => currentMatchForCourt(state, c.id))
    .filter((m): m is Match => !!m && m.winner === null);
  return current.sort((a, b) => {
    if (a.startedAt !== null && b.startedAt !== null) return a.startedAt - b.startedAt || a.roundNumber - b.roundNumber;
    if (a.startedAt !== null) return -1;
    if (b.startedAt !== null) return 1;
    return a.roundNumber - b.roundNumber;
  })[0];
}

/**
 * The next `length` matches after the ones already seated on courts,
 * found by playing the session forward with the real scheduler: open
 * courts fill, then the court assumed to finish next records a result and
 * refills, and so on. Before the session starts this previews the opening
 * matches. A match is "likely" when everyone in it is waiting right now
 * and isn't in an earlier forecast match (only a swap, join, or departure
 * changes it), "tentative" when it
 * depends on who finishes when, and "planned" when it's locked in.
 */
export function forecast(state: SessionState, length = FORECAST_LENGTH): ForecastMatch[] {
  const busyNow = busyPlayerIds(state);
  const result: ForecastMatch[] = [];
  let sim: SessionState = { ...state, sessionStarted: true };

  // Each pass either seats at least one match or finishes one; bound the
  // loop anyway so a state that can never fill can't spin forever.
  for (let guard = 0; guard < (length + sim.courts.length) * 4 && result.length < length; guard++) {
    for (const court of sim.courts) {
      if (result.length >= length) break;
      const current = currentMatchForCourt(sim, court.id);
      if (current && current.winner === null) continue;
      const generated = generateNextMatchForCourt(sim, court.id, { now: () => 0 });
      if (!generated.match) continue;
      sim = applyGeneratedMatch(sim, generated);
      const { teamA, teamB } = generated.match;
      const alreadyForecast = new Set(result.flatMap((m) => [...m.teamA, ...m.teamB]));
      result.push({
        teamA,
        teamB,
        confidence: generated.plannedMatchId
          ? "planned"
          : [...teamA, ...teamB].every((id) => !busyNow.has(id) && !alreadyForecast.has(id))
            ? "likely"
            : "tentative",
        plannedMatchId: generated.plannedMatchId ?? null,
        ruleConflicts: generated.ruleConflicts ?? [],
      });
    }
    if (result.length >= length) break;

    const finishing = nextToFinish(sim);
    if (!finishing) break;
    const started = {
      ...sim,
      matches: sim.matches.map((m) => (m.id === finishing.id ? { ...m, startedAt: m.startedAt ?? 0 } : m)),
    };
    sim = recordResult(started, { matchId: finishing.id, winner: "A" }, KEEP_ORDER);
  }

  return result;
}

export interface NextUpEntry extends RankedUnit {
  /** Index of the earliest planned match this unit is locked into, or null. */
  plannedIndex: number | null;
}

/**
 * Who's waiting, in the order they'll actually be seated: anyone locked
 * into a planned match first (plans are seated before anything is
 * calculated), in plan order, then everyone else in normal queue order.
 * This is what the Next Up panel renders, so it agrees with the Upcoming
 * tab after a swap there.
 */
export function nextUpOrder(state: SessionState): NextUpEntry[] {
  const planIndexById = new Map<string, number>();
  state.plannedMatches.forEach((m, i) => {
    for (const id of [...m.teamA, ...m.teamB]) if (!planIndexById.has(id)) planIndexById.set(id, i);
  });
  const entries = nextUpQueue(state).map((u) => {
    const indexes = u.playerIds.map((id) => planIndexById.get(id)).filter((i): i is number => i !== undefined);
    return { ...u, plannedIndex: indexes.length > 0 ? Math.min(...indexes) : null };
  });
  const planned = entries.filter((e) => e.plannedIndex !== null).sort((a, b) => a.plannedIndex! - b.plannedIndex!);
  return [...planned, ...entries.filter((e) => e.plannedIndex === null)];
}

export interface ForecastSwapInput {
  /** Index into the current forecast of the match being edited. */
  matchIndex: number;
  outPlayerId: string;
  inPlayerId: string;
}

function swapIds(team: string[], a: string, b: string): string[] {
  return team.map((id) => (id === a ? b : id === b ? a : id));
}

function sameLineup(a: { teamA: string[]; teamB: string[] }, b: { teamA: string[]; teamB: string[] }): boolean {
  return a.teamA.join(",") === b.teamA.join(",") && a.teamB.join(",") === b.teamB.join(",");
}

/** A player can appear in several forecast matches; a two-way swap pairs
 * with their appearance nearest the edited match (later wins a tie), or
 * -1 if they're not in the forecast at all. */
function nearestAppearance(matches: ForecastMatch[], playerId: string, from: number): number {
  let best = -1;
  matches.forEach((m, i) => {
    if (![...m.teamA, ...m.teamB].includes(playerId)) return;
    if (best === -1 || Math.abs(i - from) < Math.abs(best - from) || (Math.abs(i - from) === Math.abs(best - from) && i > best)) {
      best = i;
    }
  });
  return best;
}

let planCounter = 0;
function newPlanId(): string {
  planCounter += 1;
  return `plan-${Date.now()}-${planCounter}`;
}

/**
 * Swaps a player in forecast match `matchIndex` — with an opponent (team
 * switch), with a player in another forecast match (two-way, using their
 * appearance nearest this one), or with anyone not in the forecast
 * (substitution) — and locks every forecast
 * match up to and including the furthest one touched as a planned match,
 * so nothing ahead of the edit can rearrange itself around it. No-ops if
 * the swap is invalid or couldn't actually happen as shown (e.g. the
 * incoming player would still be playing on another court by then).
 */
export function swapInForecast(state: SessionState, input: ForecastSwapInput): SessionState {
  const { matchIndex, outPlayerId, inPlayerId } = input;
  if (outPlayerId === inPlayerId) return state;
  const current = forecast(state);
  const target = current[matchIndex];
  if (!target || ![...target.teamA, ...target.teamB].includes(outPlayerId)) return state;
  const incoming = state.players.find((p) => p.id === inPlayerId);
  if (!incoming?.active) return state;

  const inIndex = nearestAppearance(current, inPlayerId, matchIndex);
  const lockThrough = Math.max(matchIndex, inIndex, state.plannedMatches.length - 1);

  const plannedMatches: PlannedMatch[] = current.slice(0, lockThrough + 1).map((m, i) => {
    const touched = i === matchIndex || i === inIndex;
    return {
      id: m.plannedMatchId ?? newPlanId(),
      teamA: touched ? swapIds(m.teamA, outPlayerId, inPlayerId) : m.teamA,
      teamB: touched ? swapIds(m.teamB, outPlayerId, inPlayerId) : m.teamB,
    };
  });

  const next = { ...state, plannedMatches };
  const check = forecast(next);
  if (!plannedMatches.every((plan, i) => check[i] && sameLineup(check[i], plan))) return state;
  return next;
}

export interface UnlockPlannedMatchInput {
  id: string;
}

/** Releases a planned match and every plan after it, mirroring how
 * locking works — the forecast recalculates from there. */
export function unlockPlannedMatch(state: SessionState, input: UnlockPlannedMatchInput): SessionState {
  const index = state.plannedMatches.findIndex((m) => m.id === input.id);
  if (index === -1) return state;
  return { ...state, plannedMatches: state.plannedMatches.slice(0, index) };
}

export function clearPlannedMatches(state: SessionState): SessionState {
  if (state.plannedMatches.length === 0) return state;
  return { ...state, plannedMatches: [] };
}
