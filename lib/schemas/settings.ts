import { z } from "zod";

export const SessionSettingsSchema = z.object({
  format: z.union([z.literal("singles"), z.literal("doubles")]),
  courtCount: z.number().int().positive(),
  /** How a match's result is recorded: tap the winning team, or enter
   * both teams' scores (higher score wins). Changeable any time — it only
   * affects results recorded from then on. */
  resultEntry: z.union([z.literal("winner"), z.literal("score")]).default("winner"),
  /** How players are picked for the next match: "casual" (default when
   * absent) balances games played, rests and skill; "stack" is paddle
   * stacking — strictly in line order, winners vs winners and losers vs
   * losers. Locked once the session starts. */
  rotation: z.union([z.literal("casual"), z.literal("stack")]).optional(),
  /** Paddle stack only: whether a newcomer plays the next match ("next") or
   * joins the back of the stack ("back", default when absent). */
  stackNewcomers: z.union([z.literal("next"), z.literal("back")]).optional(),
});

export type SessionSettings = z.infer<typeof SessionSettingsSchema>;
