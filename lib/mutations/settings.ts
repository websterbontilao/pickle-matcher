import type { SessionState } from "@/lib/schemas";

/** True once "Start session" has been tapped. Format and court
 * configuration are both locked from this point on — no-op the relevant
 * reducers rather than throwing, so a stale UI can't corrupt state. */
export function hasSessionStarted(state: SessionState): boolean {
  return state.sessionStarted;
}

/** One-time gate that locks format/courts and allows courts to start
 * auto-filling with matches. No-ops if already started. */
export function startSession(state: SessionState): SessionState {
  if (state.sessionStarted) return state;
  return { ...state, sessionStarted: true };
}

/** True once at least one match has actually been started (its timer
 * begun) — the point of no return for stopSession, since players' stats
 * may already reflect real play. */
export function anyMatchStarted(state: SessionState): boolean {
  return state.matches.some((m) => m.startedAt !== null);
}

/** Reverses "Start session": re-locks format/courts for editing and clears
 * whatever courts auto-filled in the meantime. Only allowed while nobody
 * has actually started a match yet — once play begins there's real match
 * history to preserve, so this is a narrow "I changed my mind" escape
 * hatch, not a general undo. Anyone added while it was briefly started
 * stops being a newcomer — back in setup, nobody has a head start. */
export function stopSession(state: SessionState): SessionState {
  if (!state.sessionStarted || anyMatchStarted(state)) return state;
  return {
    ...state,
    sessionStarted: false,
    matches: [],
    sitOuts: [],
    matchSequence: 0,
    players: state.players.map((p) => (p.newcomer ? { ...p, newcomer: false } : p)),
  };
}

export interface SetFormatInput {
  format: "singles" | "doubles";
}

/** Clears any planned matches when the format actually changes — a
 * doubles lineup can't be seated as singles, or vice versa. */
export function setFormat(state: SessionState, input: SetFormatInput): SessionState {
  if (hasSessionStarted(state)) return state;
  if (state.settings.format === input.format) return state;
  return { ...state, settings: { ...state.settings, format: input.format }, plannedMatches: [] };
}

export interface SetResultEntryInput {
  resultEntry: "winner" | "score";
}

/** Not locked by the session starting — it only changes how results are
 * recorded from now on, never any match already decided. */
export function setResultEntry(state: SessionState, input: SetResultEntryInput): SessionState {
  if (state.settings.resultEntry === input.resultEntry) return state;
  return { ...state, settings: { ...state.settings, resultEntry: input.resultEntry } };
}
