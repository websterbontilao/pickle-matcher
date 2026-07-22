"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRemoveCourt, useRenameCourt } from "@/lib/hooks/useCourtMutations";
import { useCourts } from "@/lib/hooks/useSessionState";
import { isNameTaken } from "@/lib/utils/names";
import type { Court } from "@/lib/schemas";

export function CourtRow({ court, canRemove }: { court: Court; canRemove: boolean }) {
  const renameCourt = useRenameCourt();
  const removeCourt = useRemoveCourt();
  const courts = useCourts();
  const [name, setName] = useState(court.name);
  const [error, setError] = useState(false);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(court.name);
      setError(false);
      return;
    }
    if (trimmed === court.name) {
      setError(false);
      return;
    }
    if (isNameTaken(trimmed, courts, court.id)) {
      setError(true);
      return;
    }
    renameCourt.mutate({ id: court.id, name: trimmed });
    setError(false);
  }

  return (
    <div className="border-b px-3 py-1.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(false);
          }}
          onBlur={commit}
          className="h-8"
          aria-invalid={error}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          disabled={!canRemove}
          onClick={() => removeCourt.mutate({ id: court.id })}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">A court named &quot;{name.trim()}&quot; already exists.</p>}
    </div>
  );
}
