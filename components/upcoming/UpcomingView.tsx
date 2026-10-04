"use client";

import { useMemo } from "react";
import { AlertTriangle, Lock, Sparkles, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlayerSlotBox } from "@/components/round/PlayerSlotBox";
import { UnevenNote } from "@/components/round/UnevenNote";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { useClearPlannedMatches, useSwapInForecast, useUnlockPlannedMatch } from "@/lib/hooks/useForecastMutations";
import { forecast, swapInForecast, type ForecastConfidence, type ForecastMatch } from "@/lib/mutations/forecast";
import type { Player, SessionState } from "@/lib/schemas";

const CONFIDENCE_LABEL: Record<ForecastConfidence, string> = {
  likely: "Likely",
  tentative: "Tentative",
  planned: "Planned",
};

function ConfidenceBadge({ confidence }: { confidence: ForecastConfidence }) {
  if (confidence === "planned") {
    return (
      <Badge variant="default">
        <Lock />
        {CONFIDENCE_LABEL.planned}
      </Badge>
    );
  }
  return (
    <Badge variant={confidence === "likely" ? "secondary" : "outline"} className={confidence === "tentative" ? "text-muted-foreground" : undefined}>
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  );
}

/** Newcomers who are waiting but stuck behind planned matches they aren't
 * part of — plans outrank newcomer priority, so the organizer should know. */
function newcomersBehindPlans(state: SessionState): Player[] {
  if (state.plannedMatches.length === 0) return [];
  const planned = new Set(state.plannedMatches.flatMap((m) => [...m.teamA, ...m.teamB]));
  return state.players.filter((p) => p.active && p.newcomer && !planned.has(p.id));
}

function ForecastCard({
  index,
  match,
  state,
  onSwap,
  onUnlock,
}: {
  index: number;
  match: ForecastMatch;
  state: SessionState;
  onSwap: (index: number, outPlayerId: string, inPlayerId: string) => void;
  onUnlock: (plannedMatchId: string) => void;
}) {
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  const active = state.players.filter((p) => p.active);

  function slot(id: string, team: string[]) {
    const player = playersById.get(id);
    if (!player) return null;
    // Same rule as the Round tab: exclude self and same-side teammates
    // (no-op swaps); opponents stay in, doubling as a team switch.
    const candidates = active.filter((c) => c.id !== id && !team.includes(c.id));
    return <PlayerSlotBox key={id} player={player} swappable candidates={candidates} onSwap={(inId) => onSwap(index, id, inId)} />;
  }

  return (
    <li className="px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Match {index + 1}</span>
          <ConfidenceBadge confidence={match.confidence} />
        </div>
        {match.plannedMatchId && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onUnlock(match.plannedMatchId!)}>
            <Unlock className="size-3.5" />
            Unlock
          </Button>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="space-y-1.5">{match.teamA.map((id) => slot(id, match.teamA))}</div>
        <span className="text-xs text-muted-foreground">vs</span>
        <div className="space-y-1.5">{match.teamB.map((id) => slot(id, match.teamB))}</div>
      </div>

      <UnevenNote match={match} players={state.players} />

      {match.ruleConflicts.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {match.ruleConflicts.map((c) => (
            <li key={`${c.playerId}-${c.rule}`} className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {playersById.get(c.playerId)?.name ?? "Unknown"}{" "}
              {c.rule === "resting" ? "is due a rest after consecutive games" : "was guaranteed a spot but is left out"}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The Upcoming tab: the forecast of the next matches after the ones on
 * court, with swaps that lock matches in as planned. */
export function UpcomingView() {
  const { state, isLoading } = useSessionState();
  const swapInForecastMutation = useSwapInForecast();
  const unlockPlannedMatch = useUnlockPlannedMatch();
  const clearPlannedMatches = useClearPlannedMatches();
  const matches = useMemo(() => forecast(state), [state]);

  if (isLoading) return null;

  if (!state.players.some((p) => p.active)) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        Add players in Setup to see upcoming matches.
      </p>
    );
  }

  function handleSwap(matchIndex: number, outPlayerId: string, inPlayerId: string) {
    const input = { matchIndex, outPlayerId, inPlayerId };
    // Run the reducer up front so an impossible swap gets an explanation
    // instead of silently doing nothing.
    if (swapInForecast(state, input) === state) {
      const name = state.players.find((p) => p.id === inPlayerId)?.name ?? "That player";
      toast.error(`Can't swap — ${name} would still be on court by then.`);
      return;
    }
    swapInForecastMutation.mutate(input);
  }

  const stuckNewcomers = newcomersBehindPlans(state);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h1 className="text-sm font-semibold">Upcoming</h1>
        {state.plannedMatches.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => clearPlannedMatches.mutate()}>
            Clear all plans
          </Button>
        )}
      </div>

      {stuckNewcomers.map((p) => (
        <p key={p.id} className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2 text-xs">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          {p.name} is new and waiting behind {state.plannedMatches.length} planned match
          {state.plannedMatches.length === 1 ? "" : "es"} — swap them in to play sooner.
        </p>
      ))}

      {matches.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Not enough players for a match yet.</p>
      ) : (
        <ol className="divide-y border-b">
          {matches.map((m, i) => (
            <ForecastCard
              key={i}
              index={i}
              match={m}
              state={state}
              onSwap={handleSwap}
              onUnlock={(id) => unlockPlannedMatch.mutate({ id })}
            />
          ))}
        </ol>
      )}

      <p className="px-3 py-3 text-xs text-muted-foreground">
        {state.sessionStarted ? "" : "Preview of the opening matches. "}
        A forecast, assuming courts finish in the order they started. Swapping a player locks that match and every
        match before it.
      </p>
    </div>
  );
}
