import { z } from "zod";

export const RecordPathStepSchema = z
  .object({ relationId: z.uuid(), direction: z.enum(["outgoing", "incoming"]) })
  .strict();
export const RecordRelationshipPathSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(200),
    path: z.array(RecordPathStepSchema).min(1).max(6),
    archived: z.boolean(),
  })
  .strict();
export type RecordRelationshipPath = z.infer<typeof RecordRelationshipPathSchema>;
export type RecordPathStep = z.infer<typeof RecordPathStepSchema>;

export const RecordPathSelectionSchema = z
  .object({ pathId: z.uuid(), limit: z.number().int().min(1).max(25).default(3) })
  .strict();
export type RecordPathSelection = z.infer<typeof RecordPathSelectionSchema>;
