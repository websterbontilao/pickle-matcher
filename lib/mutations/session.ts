import { EMPTY_SESSION_STATE, type SessionState } from "@/lib/schemas";

/** Irreversible: wipes players, matches, courts, and stats. UI must confirm
 * before calling this. */
export function resetSession(): SessionState {
  return { ...EMPTY_SESSION_STATE, courts: EMPTY_SESSION_STATE.courts.map((c) => ({ ...c })) };
}
