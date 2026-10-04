"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MatchScore } from "@/lib/mutations/rounds";

function parseScore(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** Enter (or correct) both sides' scores; the higher one wins. Ties can't
 * be saved. */
export function ScoreDialog({
  open,
  onOpenChange,
  teamALabel,
  teamBLabel,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamALabel: string;
  teamBLabel: string;
  initial: MatchScore | undefined;
  onSave: (score: MatchScore) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Start from the recorded score (when correcting) each time it opens.
    setWasOpen(open);
    if (open) {
      setA(initial ? String(initial.a) : "");
      setB(initial ? String(initial.b) : "");
    }
  }

  const scoreA = parseScore(a);
  const scoreB = parseScore(b);
  const complete = scoreA !== null && scoreB !== null;
  const tied = complete && scoreA === scoreB;
  const winnerLabel = complete && !tied ? (scoreA > scoreB ? teamALabel : teamBLabel) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || tied) return;
    onSave({ a: scoreA, b: scoreB });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{initial ? "Correct the score" : "Enter the score"}</DialogTitle>
            <DialogDescription>The team with the higher score wins.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {[
              { id: "score-a", label: teamALabel, value: a, set: setA },
              { id: "score-b", label: teamBLabel, value: b, set: setB },
            ].map(({ id, label, value, set }, i) => (
              <div key={id} className="grid grid-cols-[1fr_5rem] items-center gap-3">
                <Label htmlFor={id} className="truncate">
                  {label}
                </Label>
                <Input
                  id={id}
                  autoFocus={i === 0}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  value={value}
                  onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tabular-nums"
                />
              </div>
            ))}
            <p className="min-h-5 text-sm">
              {tied ? (
                <span className="text-destructive">A tie can&apos;t decide a winner.</span>
              ) : winnerLabel ? (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Trophy className="size-3.5" />
                  {winnerLabel} {winnerLabel.includes(" & ") ? "win" : "wins"}
                </span>
              ) : null}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!complete || tied}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
