import { z } from "zod";

export const SKILL_RATING_MIN = 2;
export const SKILL_RATING_MAX = 6;
export const SKILL_RATING_STEP = 0.5;
export const SKILL_RATING_DEFAULT = 2;

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  linkedPlayerId: z.string().optional(),
  active: z.boolean(),
  joinedAt: z.number(),
  /** Secondary sort key used to break ties on `gamesPlayed` when picking who
   * plays next — effectively "position in line". Starts equal to `joinedAt`
   * (so unplayed players queue in join order) and gets bumped to the back —
   * in shuffled order relative to whoever else just came off court together
   * — every time this player finishes a match; see `recordResult`. */
  queuePosition: z.number().default(0),
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
  /** True for a player added after the session started who hasn't had a
   * match recorded yet — they jump the whole queue (ahead even of forced
   * play) for exactly one match. Cleared by `recordResult`. */
  newcomer: z.boolean().default(false),
  /** Hidden games count added to `gamesPlayed` for queue ranking only (see
   * `rankedGames`), never shown in stats. Set once, when a newcomer's first
   * match is recorded, so they land level with the field instead of keeping
   * fewest-games priority until they've caught up. */
  gamesCredit: z.number().int().nonnegative().default(0),
  /** How strong the player is, in half steps. Only used to split the
   * already-chosen players into balanced teams — never to decide who plays
   * or when. */
  skillRating: z
    .number()
    .min(SKILL_RATING_MIN)
    .max(SKILL_RATING_MAX)
    .multipleOf(SKILL_RATING_STEP)
    .default(SKILL_RATING_DEFAULT),
});

export type Player = z.infer<typeof PlayerSchema>;
