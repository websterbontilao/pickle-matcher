import { z } from "zod";

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  linkedPlayerId: z.string().optional(),
  active: z.boolean(),
  joinedAt: z.number(),
  gamesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  /** How many completed games in a row this player has played with no rest
   * in between. Reset to 0 whenever they're benched for a cycle; used to
   * force a rest once it hits the threshold, even if they'd otherwise have
   * top scheduling priority (fewest games played). */
  consecutiveGames: z.number().int().nonnegative().default(0),
  /** How many generation cycles in a row this player has sat out (benched
   * or waiting). Reset to 0 whenever they're seated in a new match; used to
   * guarantee them a spot once it hits the threshold, even if normal
   * priority (or a tie-break) would otherwise pass them over again. */
  consecutiveSitOuts: z.number().int().nonnegative().default(0),
});

export type Player = z.infer<typeof PlayerSchema>;
