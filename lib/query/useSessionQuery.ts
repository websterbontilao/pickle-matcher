import { useQuery } from "@tanstack/react-query";
import { loadSessionState } from "@/lib/storage/sessionStorage";
import { sessionQueryKey } from "./queryKeys";

/** The single source of truth for session state in the client cache. Every
 * other hook is a selector over this one query — there is only one
 * localStorage blob, so there should be only one cache entry. */
export function useSessionQuery() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => loadSessionState(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
