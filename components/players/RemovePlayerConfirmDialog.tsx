"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRemovePlayer } from "@/lib/hooks/usePlayerMutations";
import type { Player } from "@/lib/schemas";

/** Opened from the player's actions menu (which disables "Remove" while
 * they're in a match). */
export function RemovePlayerConfirmDialog({
  player,
  open,
  onOpenChange,
}: {
  player: Player;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const removePlayer = useRemovePlayer();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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
