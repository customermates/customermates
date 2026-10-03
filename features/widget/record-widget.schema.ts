import { RecordActivityWidgetDtoSchema, RecordActivityWidgetInputSchema } from "./record-activity-widget.schema";
import { z } from "zod";

import { RecordMeasureSchema, RecordMeasureResultSchema } from "@/features/records/record-measure.schema";
import { WidgetDisplayOptionsSchema, WidgetLayoutSchema } from "./widget-display.schema";

export const RecordWidgetInputSchema = z
  .object({
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(200),
    name: z.string().trim().min(1).max(255),
    measure: RecordMeasureSchema,
    displayOptions: WidgetDisplayOptionsSchema,
    isTemplate: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.id) !== Boolean(value.expectedVersion)) {
      context.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "Updates require the saved widget version",
      });
    }
  });
export type RecordWidgetInput = z.infer<typeof RecordWidgetInputSchema>;

export const RecordWidgetDtoSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal("chart"),
    contractVersion: z.literal(2),
    version: z.number().int().positive(),
    userId: z.string(),
    companyId: z.string(),
    name: z.string(),
    measure: RecordMeasureSchema,
    displayOptions: WidgetDisplayOptionsSchema,
    layout: WidgetLayoutSchema.nullable(),
    isTemplate: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    data: RecordMeasureResultSchema.nullable(),
    status: z.enum(["ready", "unavailable"]),
    groupOptions: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().nullable() }).strict()),
  })
  .strict();
export type RecordWidgetDto = z.infer<typeof RecordWidgetDtoSchema>;
export type StoredRecordWidget = Omit<RecordWidgetDto, "data" | "status" | "groupOptions">;

export interface RecordWidgetRepo {
  findOwned(id: string): Promise<StoredRecordWidget | null>;
  findReadable(id: string): Promise<StoredRecordWidget | null>;
  listOwned(): Promise<StoredRecordWidget[]>;
  save(input: RecordWidgetInput, id: string): Promise<StoredRecordWidget>;
}

export const GenericRecordWidgetDtoSchema = z.discriminatedUnion("kind", [
  RecordWidgetDtoSchema,
  RecordActivityWidgetDtoSchema,
]);
export const GenericRecordWidgetInputSchema = z.union([RecordWidgetInputSchema, RecordActivityWidgetInputSchema]);
export type GenericRecordWidgetDto = z.infer<typeof GenericRecordWidgetDtoSchema>;
