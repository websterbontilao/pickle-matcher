"use client";

import { UserMinus } from "lucide-react";
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
import { useRemovePlayer } from "@/lib/hooks/usePlayerMutations";
import type { Player } from "@/lib/schemas";

export function RemovePlayerConfirmDialog({ player, disabled }: { player: Player; disabled: boolean }) {
  const removePlayer = useRemovePlayer();

  if (disabled) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground"
        disabled
        title="Can't remove a player who's currently in a match"
      >
        <UserMinus className="size-3.5" />
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" />}
      >
        <UserMinus className="size-3.5" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {player.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They&apos;ll be excluded from future rounds, but their match history and stats stay in the summary.
            This doesn&apos;t affect their current match if a round is already in progress.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => removePlayer.mutate({ id: player.id })}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
