import { z } from "zod";
import { WidgetPlacementSchema } from "./widget-grid";
import {
  RecordActivityQuerySchema,
  RecordActivitiesResultSchema,
} from "@/ee/messaging/activities/record-activities.schema";
import { WidgetLayoutSchema } from "./widget-display.schema";

const RecordActivityWidgetFieldsSchema = z
  .object({
    kind: z
      .literal("activityTimeline")
      .describe("activityTimeline. Optional on update; a saved widget keeps its kind."),
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(200),
    name: z.string().trim().min(1).max(255),
    activityQuery: RecordActivityQuerySchema,
    displayOptions: z.object({ showFilters: z.boolean() }).strict(),
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

export type SavedRecordActivityWidgetInput = Omit<z.infer<typeof RecordActivityWidgetFieldsSchema>, "kind"> & {
  kind?: "activityTimeline";
};

export const RecordActivityWidgetInputSchema = RecordActivityWidgetFieldsSchema.partial({
  kind: true,
  name: true,
  activityQuery: true,
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
  for (const key of ["name", "activityQuery"] as const) {
    if (value[key] === undefined)
      context.addIssue({ code: "custom", path: [key], message: "Creation requires this field" });
  }
});

export const RecordActivityWidgetDtoSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal("activityTimeline"),
    version: z.number().int().positive(),
    userId: z.string(),
    companyId: z.string(),
    name: z.string(),
    activityQuery: RecordActivityQuerySchema,
    displayOptions: z.object({ showFilters: z.boolean() }).strict(),
    layout: WidgetLayoutSchema.nullable(),
    viewId: z.uuid().nullable(),
    isTemplate: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    schemaRevision: z.number().int().nonnegative(),
    data: RecordActivitiesResultSchema.nullable(),
    status: z.enum(["ready", "unavailable"]),
  })
  .strict();

export type RecordActivityWidgetInput = z.infer<typeof RecordActivityWidgetInputSchema>;
export type RecordActivityWidgetDto = z.infer<typeof RecordActivityWidgetDtoSchema>;
export type StoredRecordActivityWidget = Omit<RecordActivityWidgetDto, "schemaRevision" | "data" | "status">;
