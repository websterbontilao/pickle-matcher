"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStartSession } from "@/lib/hooks/useSettingsMutations";

export function StartSessionButton() {
  const startSession = useStartSession();
  return (
    <Button className="gap-1.5" onClick={() => startSession.mutate()}>
      <Play className="size-4" />
      Start session
    </Button>
  );
}
