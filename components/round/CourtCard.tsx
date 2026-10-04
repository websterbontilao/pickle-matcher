"use client";

import { useState } from "react";
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
import { ClipboardPen, Play, Trophy } from "lucide-react";
import type { Court, Match, Player } from "@/lib/schemas";
import { isMatchSwappable, type MatchScore } from "@/lib/mutations/rounds";
import { useChangeResult, useRecordResult, useStartMatch } from "@/lib/hooks/useRoundMutations";
import { PlayerSlotBox } from "./PlayerSlotBox";
import { CourtTimer } from "./CourtTimer";
import { CourtDiagram } from "./CourtDiagram";
import { UnevenNote } from "./UnevenNote";
import { ScoreDialog } from "./ScoreDialog";

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

/** Score-mode result control: one big "Enter score" button for a live
 * match, or the recorded score with a way to correct it. */
function ScoreControls({ match, players, onSave }: { match: Match; players: Player[]; onSave: (score: MatchScore) => void }) {
  const [open, setOpen] = useState(false);
  const decided = match.winner !== null;
  return (
    <>
      {decided ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="text-sm tabular-nums">
            {match.score ? (
              <>
                <span className={cn(match.winner === "A" && "font-semibold")}>{match.score.a}</span>
                {" – "}
                <span className={cn(match.winner === "B" && "font-semibold")}>{match.score.b}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No score recorded</span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {match.score ? "Correct score" : "Add score"}
          </Button>
        </div>
      ) : (
        <Button className="min-h-14 w-full gap-1.5 text-base font-semibold" onClick={() => setOpen(true)}>
          <ClipboardPen className="size-4" />
          Enter score
        </Button>
      )}
      <ScoreDialog
        open={open}
        onOpenChange={setOpen}
        teamALabel={teamLabel(match.teamA, players)}
        teamBLabel={teamLabel(match.teamB, players)}
        initial={match.score}
        onSave={onSave}
      />
    </>
  );
}

export function CourtCard({
  court,
  match,
  players,
  swapCandidates,
  onSwap,
  resultEntry,
}: {
  court: Court;
  match: Match | undefined;
  players: Player[];
  swapCandidates: Player[];
  onSwap: (matchId: string, outPlayerId: string, inPlayerId: string) => void;
  resultEntry: "winner" | "score";
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

  function handleScore(score: MatchScore) {
    if (!match) return;
    if (decided) changeResult.mutate({ matchId: match.id, score });
    else recordResult.mutate({ matchId: match.id, score });
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
          <UnevenNote match={match} players={players} />
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
          {!decided && <UnevenNote match={match} players={players} />}
          {resultEntry === "score" ? (
            <ScoreControls match={match} players={players} onSave={handleScore} />
          ) : (
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
          )}
          {decided && (
            <p className="mt-1.5 text-xs text-muted-foreground">Waiting for enough players for the next match</p>
          )}
        </div>
      )}
    </div>
  );
}
