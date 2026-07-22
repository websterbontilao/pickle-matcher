import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionState } from "@/lib/schemas";
import { loadSessionState, saveSessionState } from "@/lib/storage/sessionStorage";
import { fillOpenCourts } from "@/lib/mutations/rounds";
import { sessionQueryKey } from "./queryKeys";

/**
 * Wraps a pure (SessionState, input) => SessionState reducer with the same
 * optimistic-update -> localStorage-write -> rollback-on-error behavior for
 * every mutation. No component or hook outside this file (and
 * lib/storage/sessionStorage.ts) touches localStorage directly.
 *
 * `onMutate` fires before `mutationFn` in TanStack Query, so by the time
 * `mutationFn` runs, the cache already holds the optimistically-updated
 * state. `mutationFn` must reuse that same pre-mutation snapshot (captured
 * here in a ref) rather than re-reading the cache, or the reducer would be
 * applied twice per call (e.g. a player/court added twice).
 *
 * Every mutation's result is passed through `fillOpenCourts` before being
 * committed — it's idempotent and no-ops until the session has started, so
 * this is what makes "auto-generate the next match once a court frees up"
 * work centrally, without every reducer needing to know about it.
 */
export function useSessionMutation<TInput = void>(reducer: (state: SessionState, input: TInput) => SessionState) {
  const queryClient = useQueryClient();
  const previousRef = useRef<SessionState | null>(null);

  const apply = (state: SessionState, input: TInput) => fillOpenCourts(reducer(state, input));

  return useMutation({
    mutationFn: async (input: TInput) => {
      const previous = previousRef.current ?? loadSessionState();
      const next = apply(previous, input);
      saveSessionState(next);
      return next;
    },
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey: sessionQueryKey });
      const previous = queryClient.getQueryData<SessionState>(sessionQueryKey) ?? loadSessionState();
      previousRef.current = previous;
      queryClient.setQueryData(sessionQueryKey, apply(previous, input));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(sessionQueryKey, context.previous);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(sessionQueryKey, next);
    },
  });
}
