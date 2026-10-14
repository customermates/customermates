import { RecordActivityWidgetDtoSchema, RecordActivityWidgetInputSchema } from "./record-activity-widget.schema";
import { z } from "zod";
import { WidgetPlacementSchema } from "./widget-grid";

import { RecordMeasureSchema, RecordMeasureResultSchema } from "@/features/records/record-measure.schema";
import { WidgetDisplayOptionsSchema, WidgetLayoutSchema } from "./widget-display.schema";

export const RecordWidgetReadSchema = z.object({ id: z.uuid() }).strict();

const RecordWidgetFieldsSchema = z
  .object({
    kind: z.literal("chart").optional().describe("chart. Optional; a saved widget keeps its kind."),
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(200),
    name: z.string().trim().min(1).max(255),
    measure: RecordMeasureSchema,
    displayOptions: WidgetDisplayOptionsSchema,
    isTemplate: z.boolean(),
    layout: WidgetPlacementSchema.optional(),
    viewId: z
      .uuid()
      .nullable()
      .optional()
      .describe(
        "Dashboard view that holds the widget: a dashboard view ID, or null for the main dashboard. Omit it to create the widget on the caller's current dashboard view or to keep an existing widget where it is.",
      ),
  })
  .strict();

export type SavedRecordWidgetInput = z.infer<typeof RecordWidgetFieldsSchema>;

export const RecordWidgetInputSchema = RecordWidgetFieldsSchema.partial({
  name: true,
  measure: true,
  displayOptions: true,
  isTemplate: true,
}).superRefine((value, context) => {
  if (Boolean(value.id) !== Boolean(value.expectedVersion)) {
    context.addIssue({
      code: "custom",
      path: ["expectedVersion"],
      message: "Updates require the saved widget version",
    });
  }
  if (value.id) return;
  for (const key of ["name", "measure", "displayOptions"] as const) {
    if (value[key] === undefined)
      context.addIssue({ code: "custom", path: [key], message: "Creation requires this field" });
  }
});
export type RecordWidgetInput = z.infer<typeof RecordWidgetInputSchema>;

export const RecordWidgetDtoSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal("chart"),
    version: z.number().int().positive(),
    userId: z.string(),
    companyId: z.string(),
    name: z.string(),
    measure: RecordMeasureSchema,
    displayOptions: WidgetDisplayOptionsSchema,
    layout: WidgetLayoutSchema.nullable(),
    viewId: z.uuid().nullable(),
    isTemplate: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    data: RecordMeasureResultSchema.nullable(),
    status: z.enum(["ready", "unavailable"]),
    decimalPlaces: z
      .number()
      .int()
      .min(0)
      .max(30)
      .nullable()
      .optional()
      .describe("Decimal places of the measured field, used to round displayed values; null when the field sets none."),
    groupOptions: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          color: z.string().nullable(),
          probability: z
            .string()
            .nullable()
            .optional()
            .describe("The option's probability attribute as a decimal string; 0 marks a closed-lost stage."),
        })
        .strict(),
    ),
  })
  .strict();
export type RecordWidgetDto = z.infer<typeof RecordWidgetDtoSchema>;
export type StoredRecordWidget = Omit<RecordWidgetDto, "data" | "status" | "groupOptions" | "decimalPlaces">;

export const GenericRecordWidgetDtoSchema = z.discriminatedUnion("kind", [
  RecordWidgetDtoSchema,
  RecordActivityWidgetDtoSchema,
]);
export const GenericRecordWidgetInputSchema = z.union([RecordWidgetInputSchema, RecordActivityWidgetInputSchema]);
export type GenericRecordWidgetDto = z.infer<typeof GenericRecordWidgetDtoSchema>;
