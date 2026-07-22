"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUndoLastResult } from "@/lib/hooks/useRoundMutations";

export function UndoResultButton({ disabled }: { disabled: boolean }) {
  const undoLastResult = useUndoLastResult();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      disabled={disabled}
      onClick={() => undoLastResult.mutate()}
    >
      <Undo2 className="size-3.5" />
      Undo last result
    </Button>
  );
}
