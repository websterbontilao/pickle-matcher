"use client";

import { Square } from "lucide-react";
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
import { useStopSession } from "@/lib/hooks/useSettingsMutations";

export function StopSessionButton() {
  const stopSession = useStopSession();

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" />}>
        <Square className="size-3.5" />
        Stop session
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop session?</AlertDialogTitle>
          <AlertDialogDescription>
            No matches have started yet, so this is safe — it discards the courts&apos; generated lineups and
            unlocks format/court settings for editing. Players and their history are unaffected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => stopSession.mutate()}>Stop session</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
