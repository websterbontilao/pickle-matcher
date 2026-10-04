import { Armchair, Sparkles, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { REST_REASON } from "@/lib/engine/restRules";
import { nextUpQueue } from "@/lib/mutations/rounds";
import type { SessionState } from "@/lib/schemas";

const GUARANTEED_REASON = "Guaranteed to play next — sat out too many times in a row";
const NEWCOMER_REASON = "New player — first in line for their first match";

function StatusIcon({ icon: Icon, label, className }: { icon: typeof Armchair; label: string; className: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className="align-middle" />}>
        <Icon className={className} />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Preview of who's waiting and in what priority order the scheduling
 * engine will actually use for the next court that frees up — rendered
 * straight from the engine's own ranked queue (newcomers, then guaranteed,
 * then normal priority, then resting), so it can't drift from what
 * actually happens.
 * Excludes anyone currently playing, so it only shows who's actually next.
 * Always renders (rather than disappearing) once there's an active roster,
 * so "everyone's currently playing" reads as expected, not as a missing
 * panel. */
export function NextUpList({ state }: { state: SessionState }) {
  const units = nextUpQueue(state);
  const playersById = new Map(state.players.map((p) => [p.id, p]));

  if (!state.players.some((p) => p.active)) return null;

  return (
    <div className="md:sticky md:top-12">
      <h2 className="border-b px-3 py-2 text-sm font-semibold">Next up</h2>
      {units.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">Everyone is currently playing</p>
      ) : (
        <ol className="divide-y">
          {units.map((unit, i) => {
            const unitPlayers = unit.playerIds.map((id) => playersById.get(id));
            return (
              <li
                key={unit.playerIds.join("+")}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span>{unitPlayers.map((p) => p?.name ?? "Unknown").join(" & ")}</span>
                  {unit.tier === "newcomer" && (
                    <StatusIcon icon={Sparkles} label={NEWCOMER_REASON} className="size-3 shrink-0 text-primary" />
                  )}
                  {unit.tier === "resting" && (
                    <StatusIcon
                      icon={Armchair}
                      label={REST_REASON}
                      className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
                    />
                  )}
                  {unit.tier === "guaranteed" && (
                    <StatusIcon icon={Zap} label={GUARANTEED_REASON} className="size-3 shrink-0 text-primary" />
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {unitPlayers.map((p) => p?.gamesPlayed ?? 0).join("/")} Games
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
