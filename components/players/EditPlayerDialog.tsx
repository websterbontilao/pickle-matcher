"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEditPlayer } from "@/lib/hooks/usePlayerMutations";
import { usePlayers } from "@/lib/hooks/useSessionState";
import { isNameTaken } from "@/lib/utils/names";
import type { Player } from "@/lib/schemas";

export function EditPlayerDialog({ player }: { player: Player }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(player.name);
  const editPlayer = useEditPlayer();
  const players = usePlayers();

  const trimmed = name.trim();
  const duplicate = trimmed.length > 0 && isNameTaken(trimmed, players, player.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || duplicate) return;
    editPlayer.mutate({ id: player.id, name: trimmed });
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(player.name);
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
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
