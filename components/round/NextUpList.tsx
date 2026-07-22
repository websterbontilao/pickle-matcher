import { Armchair, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSchedulableUnits } from "@/lib/engine/units";
import { isForcedPlay, isForcedRest, REST_REASON } from "@/lib/engine/restRules";
import { currentlyWaitingPlayers } from "@/lib/mutations/rounds";
import type { SessionState } from "@/lib/schemas";

const GUARANTEED_REASON = "Guaranteed to play next — sat out too many times in a row";

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
 * engine will actually use for the next court that frees up — same
 * grouping (linked pairs collapse into one entry) and same sort (fewest
 * games played, then earliest joined) as lib/engine/generateNextMatch.ts.
 * Excludes anyone currently playing, so it only shows who's actually next.
 * Always renders (rather than disappearing) once there's an active roster,
 * so "everyone's currently playing" reads as expected, not as a missing
 * panel. */
export function NextUpList({ state }: { state: SessionState }) {
  const waiting = currentlyWaitingPlayers(state);
  const units = getSchedulableUnits(waiting);
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
            const resting = unit.playerIds.some((id) => {
              const p = playersById.get(id);
              return p && isForcedRest(p);
            });
            const guaranteed = unit.playerIds.some((id) => {
              const p = playersById.get(id);
              return p && isForcedPlay(p);
            });
            return (
              <li
                key={unit.playerIds.join("+")}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span>{unitPlayers.map((p) => p?.name ?? "Unknown").join(" & ")}</span>
                  {resting && (
                    <StatusIcon
                      icon={Armchair}
                      label={REST_REASON}
                      className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
                    />
                  )}
                  {guaranteed && (
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
