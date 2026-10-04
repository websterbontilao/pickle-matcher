"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEditPlayer } from "@/lib/hooks/usePlayerMutations";
import { usePlayers } from "@/lib/hooks/useSessionState";
import { isNameTaken } from "@/lib/utils/names";
import type { Player } from "@/lib/schemas";

/** Opened from the player's actions menu. */
export function EditPlayerDialog({
  player,
  open,
  onOpenChange,
}: {
  player: Player;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(player.name);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Reset the field each time the dialog opens.
    setWasOpen(open);
    if (open) setName(player.name);
  }
  const editPlayer = useEditPlayer();
  const players = usePlayers();

  const trimmed = name.trim();
  const duplicate = trimmed.length > 0 && isNameTaken(trimmed, players, player.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || duplicate) return;
    editPlayer.mutate({ id: player.id, name: trimmed });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit player</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="edit-player-name" className="mb-1.5">
              Name
            </Label>
            <Input id="edit-player-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            {duplicate && <p className="mt-1.5 text-xs text-destructive">A player named &quot;{trimmed}&quot; already exists.</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!trimmed || duplicate}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
