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
import { CourtDiagram } from "./CourtDiagram";

function playerOf(id: string, players: Player[]): Player | undefined {
  return players.find((p) => p.id === id);
}

function teamLabel(ids: string[], players: Player[]): string {
  return ids.map((id) => playerOf(id, players)?.name ?? "Unknown").join(" & ");
}

function PlayerLabel({ name, winner }: { name: string; winner: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", winner && "font-semibold")}>
      {winner && <Trophy className="size-3.5 shrink-0" />}
      {name}
    </span>
  );
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

  function swapSlot(id: string, side: "A" | "B") {
    const player = playerOf(id, players);
    if (!player) return null;
    const team = side === "A" ? match!.teamA : match!.teamB;
    // Exclude self and same-side teammates — swapping with either is a no-op.
    // Opposing-team players of this same match stay in the list, so this
    // doubles as a team-switch control.
    const candidates = swapCandidates.filter((c) => c.id !== id && !team.includes(c.id));
    return (
      <PlayerSlotBox
        key={id}
        player={player}
        swappable
        candidates={candidates}
        onSwap={(inId) => onSwap(match!.id, id, inId)}
      />
    );
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
          <CourtDiagram
            teamASlots={match.teamA.map((id) => swapSlot(id, "A"))}
            teamBSlots={match.teamB.map((id) => swapSlot(id, "B"))}
          />
          <Button size="sm" className="w-full gap-1.5" onClick={() => startMatch.mutate({ matchId: match.id })}>
            <Play className="size-3.5" />
            Start match
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <CourtDiagram
            teamASlots={match.teamA.map((id) => (
              <PlayerLabel key={id} name={playerOf(id, players)?.name ?? "Unknown"} winner={match.winner === "A"} />
            ))}
            teamBSlots={match.teamB.map((id) => (
              <PlayerLabel key={id} name={playerOf(id, players)?.name ?? "Unknown"} winner={match.winner === "B"} />
            ))}
            teamAHighlighted={match.winner === "A"}
            teamBHighlighted={match.winner === "B"}
          />
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
        </div>
      )}
    </div>
  );
}
