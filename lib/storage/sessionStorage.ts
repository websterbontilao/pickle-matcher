import { EMPTY_SESSION_STATE, SessionStateSchema, type SessionState } from "@/lib/schemas";
import { STORAGE_KEY } from "./keys";

export function loadSessionState(): SessionState {
  if (typeof window === "undefined") return EMPTY_SESSION_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SESSION_STATE;
    const parsed = SessionStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_SESSION_STATE;
  } catch {
    return EMPTY_SESSION_STATE;
  }
}

export function saveSessionState(state: SessionState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
