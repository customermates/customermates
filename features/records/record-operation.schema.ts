import { z } from "zod";

import { RecordOperationResultSchema } from "./record-query.schema";

export const RecordOperationInputSchema = z.object({ operationId: z.uuid() }).strict();
export type RecordOperationInput = z.infer<typeof RecordOperationInputSchema>;

export const RecordOperationStatusSchema = z
  .object({
    id: z.uuid(),
    state: z.enum(["pending", "staging", "completed", "cancelled", "failed"]),
    processed: z.number().int(),
    total: z.number().int(),
    errorCode: z.string().nullable(),
    result: RecordOperationResultSchema.nullable(),
    retryAfterMs: z
      .number()
      .int()
      .positive()
      .nullable()
      .describe(
        "Wait this many milliseconds before polling a pending or staging operation again; null for a terminal state.",
      ),
  })
  .strict();
export type RecordOperationStatus = z.infer<typeof RecordOperationStatusSchema>;
