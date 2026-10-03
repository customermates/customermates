import { z } from "zod";
import { RecordRefSchema } from "./record-model.schema";

export const RecordIdentityReferenceSchema = z
  .object({
    ref: RecordRefSchema,
    identityId: z.uuid().optional(),
    typeLabel: z.string(),
    typePluralLabel: z.string(),
    title: z.string(),
    avatarUrl: z.string().nullable(),
    canEdit: z.boolean(),
  })
  .strict();
export type RecordIdentityReference = z.infer<typeof RecordIdentityReferenceSchema>;
