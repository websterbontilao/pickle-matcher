"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSetSkillRating } from "@/lib/hooks/usePlayerMutations";
import { SKILL_RATING_MAX, SKILL_RATING_MIN, SKILL_RATING_STEP, type Player } from "@/lib/schemas";

const RATINGS = Array.from(
  { length: Math.round((SKILL_RATING_MAX - SKILL_RATING_MIN) / SKILL_RATING_STEP) + 1 },
  (_, i) => SKILL_RATING_MIN + i * SKILL_RATING_STEP,
);

/** One-tap skill rating chip for the Players list — the only place ratings
 * are shown or changed. Changing it rebalances upcoming matches. */
export function SkillRatingPicker({ player }: { player: Player }) {
  const setSkillRating = useSetSkillRating();
  const label = player.skillRating.toFixed(1);

  if (!player.active) {
    return <span className="text-xs tabular-nums text-muted-foreground">{label}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Skill rating ${label}, change`}
            className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full border px-1.5 text-[11px] font-normal tabular-nums text-muted-foreground transition-colors hover:text-foreground"
          />
        }
      >
        {label}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72">
        <DropdownMenuRadioGroup
          value={String(player.skillRating)}
          onValueChange={(value) => setSkillRating.mutate({ id: player.id, skillRating: Number(value) })}
        >
          <DropdownMenuLabel>Skill rating</DropdownMenuLabel>
          {RATINGS.map((r) => (
            <DropdownMenuRadioItem key={r} value={String(r)} closeOnClick className="tabular-nums">
              {r.toFixed(1)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
