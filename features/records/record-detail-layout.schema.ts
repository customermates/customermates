import { z } from "zod";
import { RecordColumnKeySchema } from "./record-column.schema";

const keys = z.array(RecordColumnKeySchema).max(500);
export const RecordDetailLayoutSchema = z.object({ pinnedFields: keys, hiddenFields: keys, fieldOrder: keys }).strict();
export type RecordDetailLayout = z.infer<typeof RecordDetailLayoutSchema>;

export const ReadRecordDetailLayoutSchema = z.object({ typeId: z.uuid() }).strict();
export const SaveRecordDetailLayoutSchema = ReadRecordDetailLayoutSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  layout: RecordDetailLayoutSchema.nullable().describe("null resets the personal override to shared type defaults."),
});
export type SaveRecordDetailLayoutInput = z.infer<typeof SaveRecordDetailLayoutSchema>;

export const RecordDetailLayoutResultSchema = z
  .object({
    typeId: z.uuid(),
    schemaRevision: z.number().int().nonnegative(),
    hasPersonalization: z.boolean(),
    layout: RecordDetailLayoutSchema,
    fields: z.array(z.object({ id: RecordColumnKeySchema, label: z.string() }).strict()),
  })
  .strict();
export type RecordDetailLayoutResult = z.infer<typeof RecordDetailLayoutResultSchema>;

export const ManageRecordDetailLayoutSchema = ReadRecordDetailLayoutSchema.extend({
  action: z.enum(["read", "save", "reset"]),
  expectedRevision: SaveRecordDetailLayoutSchema.shape.expectedRevision.optional(),
  idempotencyKey: SaveRecordDetailLayoutSchema.shape.idempotencyKey.optional(),
  layout: RecordDetailLayoutSchema.optional(),
}).superRefine((input, ctx) => {
  if (input.action === "read") {
    if (input.expectedRevision !== undefined || input.idempotencyKey !== undefined || input.layout !== undefined)
      ctx.addIssue({ code: "custom", message: "Read requires only action and typeId." });
  } else {
    if (input.expectedRevision === undefined || input.idempotencyKey === undefined)
      ctx.addIssue({ code: "custom", message: "Save and reset require expectedRevision and idempotencyKey." });
    if ((input.action === "save") !== (input.layout !== undefined))
      ctx.addIssue({ code: "custom", path: ["layout"], message: "Only save requires a layout." });
  }
});

export const recordDetailKey = (typeId: string) => `record-detail:${typeId}`;
