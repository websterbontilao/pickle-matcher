"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAddPlayers } from "@/lib/hooks/usePlayerMutations";
import { usePlayers } from "@/lib/hooks/useSessionState";
import { isNameTaken } from "@/lib/utils/names";

export function AddPlayerDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const addPlayers = useAddPlayers();
  const players = usePlayers();

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const seen: { id: string; name: string }[] = [];
  const newNames: string[] = [];
  const duplicateNames: string[] = [];
  for (const line of lines) {
    if (isNameTaken(line, [...players, ...seen])) {
      duplicateNames.push(line);
    } else {
      newNames.push(line);
      seen.push({ id: line, name: line });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newNames.length === 0) return;
    addPlayers.mutate({ names: newNames });
    setText("");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setText("");
      }}
    >
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="size-4" />
        Add player
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add player{lines.length > 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="player-names" className="mb-1.5">
              Name
            </Label>
            <Textarea
              id="player-names"
              autoFocus
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Player name\nOr add several at once, one per line"}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Add multiple players at once by putting each name on its own line.
            </p>
            {duplicateNames.length > 0 && (
              <p className="mt-1.5 text-xs text-destructive">
                Already exists, will be skipped: {duplicateNames.join(", ")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={newNames.length === 0}>
              {newNames.length > 1 ? `Add ${newNames.length} players` : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
