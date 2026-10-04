import { describe, expect, it } from "vitest";
import type { Match, Player } from "@/lib/schemas";
import { sortPlayers } from "@/lib/utils/playerSort";

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    active: true,
    joinedAt: 0,
    queuePosition: 0,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    consecutiveGames: 0,
    consecutiveSitOuts: 0,
    newcomer: false,
    gamesCredit: 0,
    skillRating: 2,
    ...overrides,
  };
}

const ana = player("ana", { name: "Ana", joinedAt: 3, gamesPlayed: 2, wins: 2, losses: 0 });
const ben = player("ben", { name: "ben", joinedAt: 1, gamesPlayed: 3, wins: 1, losses: 2 });
const cara = player("cara", { name: "Cara", joinedAt: 2, gamesPlayed: 0 });
const dan = player("dan", { name: "Dan", joinedAt: 0, gamesPlayed: 1, wins: 1, losses: 0, active: false });
const everyone = [ana, ben, cara, dan];
const ids = (players: Player[]) => players.map((p) => p.id);

describe("sortPlayers", () => {
  it("sorts names case-insensitively, keeping players who left at the bottom", () => {
    expect(ids(sortPlayers(everyone, { key: "name", direction: "asc" }, []))).toEqual(["ana", "ben", "cara", "dan"]);
    expect(ids(sortPlayers(everyone, { key: "name", direction: "desc" }, []))).toEqual(["cara", "ben", "ana", "dan"]);
  });

  it("sorts by games played and by join time", () => {
    expect(ids(sortPlayers(everyone, { key: "games", direction: "desc" }, []))).toEqual(["ben", "ana", "cara", "dan"]);
    expect(ids(sortPlayers(everyone, { key: "added", direction: "asc" }, []))).toEqual(["ben", "cara", "ana", "dan"]);
  });

  it("sorts records by wins, then fewer losses", () => {
    const eve = player("eve", { joinedAt: 4, gamesPlayed: 4, wins: 2, losses: 2 });
    expect(ids(sortPlayers([ben, eve, ana], { key: "record", direction: "desc" }, []))).toEqual(["ana", "eve", "ben"]);
  });

  it("keeps players with no games below everyone when sorting by win %, in either direction", () => {
    expect(ids(sortPlayers([cara, ben, ana], { key: "winRate", direction: "desc" }, []))).toEqual(["ana", "ben", "cara"]);
    expect(ids(sortPlayers([cara, ben, ana], { key: "winRate", direction: "asc" }, []))).toEqual(["ben", "ana", "cara"]);
  });

  it("sorts by total time played from match history", () => {
    const long: Match = { id: "m1", roundNumber: 1, courtId: "c1", teamA: ["cara"], teamB: ["ben"], winner: "A", startedAt: 0, timestamp: 600_000 };
    const short: Match = { id: "m2", roundNumber: 2, courtId: "c1", teamA: ["ana"], teamB: ["ben"], winner: "A", startedAt: 0, timestamp: 60_000 };
    expect(ids(sortPlayers([ana, ben, cara], { key: "time", direction: "desc" }, [long, short]))).toEqual(["ben", "cara", "ana"]);
  });
});
