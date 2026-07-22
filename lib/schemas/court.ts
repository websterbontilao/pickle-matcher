import { z } from "zod";

export const CourtSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

export type Court = z.infer<typeof CourtSchema>;
