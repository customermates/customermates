import { z } from "zod";

const StepCheckpointSchema = z.object({
  cursor: z.string().nullish(),
  done: z.boolean().optional(),
});

export const BackfillCheckpointSchema = z.object({
  email: StepCheckpointSchema.optional(),
  chat: StepCheckpointSchema.optional(),
  calendar: StepCheckpointSchema.optional(),
});
export type BackfillCheckpoint = z.infer<typeof BackfillCheckpointSchema>;
