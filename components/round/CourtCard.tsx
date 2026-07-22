"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Play, Trophy } from "lucide-react";
import type { Court, Match, Player } from "@/lib/schemas";
import { isMatchSwappable } from "@/lib/mutations/rounds";
import { useChangeResult, useRecordResult, useStartMatch } from "@/lib/hooks/useRoundMutations";
import { PlayerSlotBox } from "./PlayerSlotBox";
import { CourtTimer } from "./CourtTimer";

function playerOf(id: string, players: Player[]): Player | undefined {
  return players.find((p) => p.id === id);
}

function teamLabel(ids: string[], players: Player[]): string {
  return ids.map((id) => playerOf(id, players)?.name ?? "Unknown").join(" & ");
}

function WinnerButton({
  label,
  isWinner,
  decided,
  onConfirm,
}: {
  label: string;
  isWinner: boolean;
  decided: boolean;
  onConfirm: () => void;
}) {
  const content = (
    <>
      {isWinner && <Trophy className="size-4" />}
      {label}
    </>
  );
  const buttonClassName = "min-h-14 gap-1.5 text-base font-semibold";

  if (isWinner) {
    return (
      <Button variant="default" className={buttonClassName} disabled>
        {content}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" className={buttonClassName} />}>
        {content}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{decided ? `Change winner to ${label}?` : `Confirm ${label} wins?`}</AlertDialogTitle>
          {decided && (
            <AlertDialogDescription>This corrects the previously recorded result and its stats.</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CourtCard({
  court,
  match,
  players,
  swapCandidates,
  onSwap,
}: {
  court: Court;
  match: Match | undefined;
  players: Player[];
  swapCandidates: Player[];
  onSwap: (matchId: string, outPlayerId: string, inPlayerId: string) => void;
}) {
  const startMatch = useStartMatch();
  const recordResult = useRecordResult();
  const changeResult = useChangeResult();

  if (!match) {
    return (
      <div className="border-b px-3 py-2.5 last:border-b-0">
        <div className="mb-1 text-xs font-medium text-muted-foreground">{court.name}</div>
        <p className="text-sm text-muted-foreground">Waiting for players</p>
      </div>
    );
  }

  const swappable = isMatchSwappable(match);
  const decided = match.winner !== null;

  function handleConfirm(winner: "A" | "B") {
    if (!match) return;
    if (decided) changeResult.mutate({ matchId: match.id, winner });
    else recordResult.mutate({ matchId: match.id, winner });
  }

  return (
    <div className="border-b px-3 py-2.5 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{court.name}</span>
        {match.startedAt !== null && (
          <CourtTimer startedAt={match.startedAt} decidedAt={decided ? match.timestamp : null} />
        )}
      </div>

      {swappable ? (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div className={cn("grid gap-1.5", match.teamA.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
              {match.teamA.map((id) => {
                const player = playerOf(id, players);
                if (!player) return null;
                // Exclude self and same-side teammates — swapping with either is a no-op.
                // Opposing-team players of this same match stay in the list, so this
                // doubles as a team-switch control.
                const candidates = swapCandidates.filter((c) => c.id !== id && !match.teamA.includes(c.id));
                return (
                  <PlayerSlotBox
                    key={id}
                    player={player}
                    swappable
                    candidates={candidates}
                    onSwap={(inId) => onSwap(match.id, id, inId)}
                  />
                );
              })}
            </div>
            <div className="text-center text-xs text-muted-foreground">vs</div>
            <div className={cn("grid gap-1.5", match.teamB.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
              {match.teamB.map((id) => {
                const player = playerOf(id, players);
                if (!player) return null;
                const candidates = swapCandidates.filter((c) => c.id !== id && !match.teamB.includes(c.id));
                return (
                  <PlayerSlotBox
                    key={id}
                    player={player}
                    swappable
                    candidates={candidates}
                    onSwap={(inId) => onSwap(match.id, id, inId)}
                  />
                );
              })}
            </div>
          </div>
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => startMatch.mutate({ matchId: match.id })}
          >
            <Play className="size-3.5" />
            Start match
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className={cn("text-sm", match.winner === "A" && "font-semibold")}>
              {teamLabel(match.teamA, players)}
            </div>
            <span className="text-xs text-muted-foreground">vs</span>
            <div className={cn("text-right text-sm", match.winner === "B" && "font-semibold")}>
              {teamLabel(match.teamB, players)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <WinnerButton
              label={teamLabel(match.teamA, players)}
              isWinner={match.winner === "A"}
              decided={decided}
              onConfirm={() => handleConfirm("A")}
            />
            <WinnerButton
              label={teamLabel(match.teamB, players)}
              isWinner={match.winner === "B"}
              decided={decided}
              onConfirm={() => handleConfirm("B")}
            />
          </div>
          {decided && (
            <p className="mt-1.5 text-xs text-muted-foreground">Waiting for enough players for the next match</p>
          )}
        </>
      )}
    </div>
  );
}
