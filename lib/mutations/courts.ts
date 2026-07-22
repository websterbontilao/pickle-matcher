import type { Court, SessionState } from "@/lib/schemas";
import { generateId } from "@/lib/utils/id";
import { isNameTaken } from "@/lib/utils/names";
import { hasSessionStarted } from "@/lib/mutations/settings";

function withCourtCount(state: SessionState, courts: Court[]): SessionState {
  return { ...state, courts, settings: { ...state.settings, courtCount: courts.length } };
}

function nextAvailableCourtName(courts: Court[]): string {
  let n = courts.length + 1;
  let name = `Court ${n}`;
  while (isNameTaken(name, courts)) {
    n += 1;
    name = `Court ${n}`;
  }
  return name;
}

/** Adding/removing courts changes the court count the scheduling engine
 * relies on, so — like format — it's locked once the session has started
 * (first round generated). Renaming a court is purely cosmetic and stays
 * editable at any time. */
export function addCourt(state: SessionState): SessionState {
  if (hasSessionStarted(state)) return state;
  const court: Court = { id: generateId(), name: nextAvailableCourtName(state.courts) };
  return withCourtCount(state, [...state.courts, court]);
}

export interface RemoveCourtInput {
  id: string;
}

export function removeCourt(state: SessionState, input: RemoveCourtInput): SessionState {
  if (hasSessionStarted(state)) return state;
  if (state.courts.length <= 1) return state; // keep at least one court
  return withCourtCount(state, state.courts.filter((c) => c.id !== input.id));
}

export interface RenameCourtInput {
  id: string;
  name: string;
}

export function renameCourt(state: SessionState, input: RenameCourtInput): SessionState {
  const trimmed = input.name.trim();
  if (!trimmed || isNameTaken(trimmed, state.courts, input.id)) return state;
  return {
    ...state,
    courts: state.courts.map((c) => (c.id === input.id ? { ...c, name: trimmed } : c)),
  };
}
