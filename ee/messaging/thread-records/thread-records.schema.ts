import { z } from "zod";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { RecordSearchHitSchema } from "@/features/records/record-search.schema";

export const ReadThreadRecordsSchema = z.object({ threadId: z.uuid() }).strict();
export const MutateThreadRecordsSchema = z
  .object({
    action: z.enum(["link", "unlink"]),
    threadId: z.uuid(),
    ref: RecordRefSchema,
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const ThreadRecordsResultSchema = z
  .object({
    records: z.array(RecordSearchHitSchema.extend({ canUnlink: z.boolean() })),
    schemaRevision: z.number().int().nonnegative(),
    canManage: z.boolean(),
  })
  .strict();
export const ThreadRecordMutationResultSchema = z
  .object({ ref: RecordRefSchema, linked: z.boolean(), schemaRevision: z.number().int().nonnegative() })
  .strict();
export const ManageThreadRecordsSchema = z
  .object({
    action: z.enum(["read", "link", "unlink"]),
    threadId: z.uuid(),
    ref: RecordRefSchema.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    idempotencyKey: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === "read") return;
    for (const key of ["ref", "expectedRevision", "idempotencyKey"] as const) {
      if (input[key] === undefined)
        context.addIssue({ code: "custom", path: [key], message: "Required for link and unlink." });
    }
  });
export type ThreadRecordsResult = z.infer<typeof ThreadRecordsResultSchema>;
export type MutateThreadRecordsInput = z.infer<typeof MutateThreadRecordsSchema>;
