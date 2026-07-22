import { EMPTY_SESSION_STATE } from "@/lib/schemas";
import { useSessionQuery } from "@/lib/query/useSessionQuery";

/** Base selector — every other selector hook derives from this one query. */
export function useSessionState() {
  const { data, isLoading } = useSessionQuery();
  return { state: data ?? EMPTY_SESSION_STATE, isLoading };
}

export function usePlayers() {
  return useSessionState().state.players;
}

export function useActivePlayers() {
  return usePlayers().filter((p) => p.active);
}

export function useCourts() {
  return useSessionState().state.courts;
}

export function useMatches() {
  return useSessionState().state.matches;
}

export function useSettings() {
  return useSessionState().state.settings;
}

export function useSitOuts() {
  return useSessionState().state.sitOuts;
}
