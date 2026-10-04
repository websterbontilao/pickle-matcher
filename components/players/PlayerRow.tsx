import { CircleDot } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlayerActionsMenu } from "./PlayerActionsMenu";
import { SkillRatingPicker } from "./SkillRatingPicker";
import { record, totalPlayTimeMs, winRate } from "@/lib/utils/stats";
import { formatTimeOfDay, formatTotalDuration } from "@/lib/utils/duration";
import type { Match, Player } from "@/lib/schemas";

export function PlayerRow({
  player,
  allPlayers,
  isPlaying,
  matches,
}: {
  player: Player;
  allPlayers: Player[];
  isPlaying: boolean;
  matches: Match[];
}) {
  const partner = player.linkedPlayerId ? allPlayers.find((p) => p.id === player.linkedPlayerId) : undefined;

  return (
    <TableRow className={!player.active ? "opacity-50" : undefined}>
      <TableCell className="py-1.5 font-medium">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {player.name}
          <SkillRatingPicker player={player} />
          {isPlaying && (
            <Badge className="gap-1 border-transparent bg-green-600/15 text-[11px] font-normal text-green-700 dark:text-green-400">
              <CircleDot className="size-2.5" />
              Playing
            </Badge>
          )}
          {partner && (
            <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
              linked · {partner.name}
            </Badge>
          )}
          {!player.active && (
            <Badge variant="outline" className="text-[11px] font-normal">
              left session
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">{player.gamesPlayed}</TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">{record(player)}</TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">{winRate(player)}</TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
        {formatTotalDuration(totalPlayTimeMs(player.id, matches))}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap text-muted-foreground">
        {formatTimeOfDay(player.joinedAt)}
      </TableCell>
      <TableCell className="py-1.5 text-right">
        {player.active && <PlayerActionsMenu player={player} allPlayers={allPlayers} isPlaying={isPlaying} />}
      </TableCell>
    </TableRow>
  );
}
