import type { RecordFieldView } from "./record-model.schema";

import { z } from "zod";

import { RecordFieldSchema, RecordValueTypeSchema } from "./record-model.schema";

export const RecordDisplayFieldSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    valueType: RecordValueTypeSchema,
    multiple: z.boolean().optional(),
    format: RecordFieldSchema.shape.format,
    options: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().nullable() }).strict()),
  })
  .strict()
  .describe("A field's label, type, format and options, for displaying its values.");
export type RecordDisplayField = z.infer<typeof RecordDisplayFieldSchema>;

export function recordDisplayField(
  field: Pick<RecordFieldView, "id" | "label" | "valueType" | "multiple" | "format" | "options">,
): RecordDisplayField {
  return {
    id: field.id,
    label: field.label,
    valueType: field.valueType,
    ...(field.multiple === undefined ? {} : { multiple: field.multiple }),
    ...(field.format === undefined ? {} : { format: field.format }),
    options: field.options.map(({ id, label, color }) => ({ id, label, color })),
  };
}
