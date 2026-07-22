"use client";

import { useSessionState } from "@/lib/hooks/useSessionState";
import { useSwapPlayerInMatch } from "@/lib/hooks/useRoundMutations";
import { currentMatchForCourt, isMatchSwappable } from "@/lib/mutations/rounds";
import { CourtCard } from "./CourtCard";
import { StartSessionButton } from "./StartSessionButton";
import { StopSessionButton } from "./StopSessionButton";
import { NextUpList } from "./NextUpList";
import { SwapTip } from "./SwapTip";
import type { Player, SessionState } from "@/lib/schemas";

/** Everyone eligible to be swapped in anywhere: free/waiting players, plus
 * anyone in a not-yet-started match (this one or another) — including the
 * opposing team of this same match, so a swap can also just switch which
 * side someone's on. Only excludes players actively playing (started)
 * elsewhere. CourtCard further excludes each box's own teammates, since
 * swapping with a teammate on the same side is a no-op. */
function getSwapCandidates(state: SessionState): Player[] {
  const activelyPlaying = new Set(
    state.matches.filter((m) => m.winner === null && !isMatchSwappable(m)).flatMap((m) => [...m.teamA, ...m.teamB]),
  );
  return state.players.filter((p) => p.active && !activelyPlaying.has(p.id));
}

export function RoundView() {
  const { state, isLoading } = useSessionState();
  const swapPlayerInMatch = useSwapPlayerInMatch();

  if (isLoading) return null;

  const activePlayers = state.players.filter((p) => p.active);

  if (activePlayers.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        Add players and configure your session in Setup, then start the session here.
      </p>
    );
  }

  if (!state.sessionStarted) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          {activePlayers.length} players, {state.courts.length} court{state.courts.length === 1 ? "" : "s"},{" "}
          {state.settings.format}. Format and courts lock once the session starts.
        </p>
        <StartSessionButton />
      </div>
    );
  }

  const anyStarted = state.matches.some((m) => m.startedAt !== null);
  const anySwappable = state.courts.some((court) => {
    const match = currentMatchForCourt(state, court.id);
    return match && isMatchSwappable(match);
  });

  return (
    <div className="mx-auto max-w-4xl md:grid md:grid-cols-[1fr_260px] md:items-start md:gap-4">
      <div>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h1 className="text-sm font-semibold">Courts</h1>
          {!anyStarted && <StopSessionButton />}
        </div>

        {anySwappable && <SwapTip />}

        <div className="mt-2 divide-y border-t">
          {state.courts.map((court) => {
            const match = currentMatchForCourt(state, court.id);
            return (
              <CourtCard
                key={court.id}
                court={court}
                match={match}
                players={state.players}
                swapCandidates={match ? getSwapCandidates(state) : []}
                onSwap={(matchId, outPlayerId, inPlayerId) =>
                  swapPlayerInMatch.mutate({ matchId, outPlayerId, inPlayerId })
                }
              />
            );
          })}
        </div>
      </div>

      <div className="mt-4 border-t pt-2 md:mt-0 md:border-t-0 md:border-l md:pt-0 md:pl-4">
        <NextUpList state={state} />
      </div>
    </div>
  );
}
