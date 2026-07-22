import { AddPlayerDialog } from "@/components/players/AddPlayerDialog";
import { PlayerList } from "@/components/players/PlayerList";

export default function PlayersPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h1 className="text-sm font-semibold">Players</h1>
        <AddPlayerDialog />
      </div>
      <PlayerList />
    </div>
  );
}
