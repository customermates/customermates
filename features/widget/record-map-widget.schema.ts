import { z } from "zod";

import { CalculatedValueSchema, RecordRefSchema } from "@/features/records/record-model.schema";
import { RecordDisplayFieldSchema } from "@/features/records/record-display-field.schema";

import { RecordWidgetSourceSchema } from "./record-widget-source.schema";
import { WidgetLayoutSchema } from "./widget-display.schema";
import { WidgetPlacementSchema } from "./widget-grid";

export const MAP_WIDGET_POINT_LIMIT = 2000;

export const MapWidgetQuerySchema = z
  .object({
    source: RecordWidgetSourceSchema,
    addressFieldId: z
      .uuid()
      .describe(
        "Address field of the source list. Each record appears at the location the server stored with its address: the building after an address lookup, otherwise the centre of its postal code.",
      ),
    colorFieldId: z
      .uuid()
      .nullable()
      .default(null)
      .describe("Optional single-choice field whose option colors color the pins and the legend."),
    sizeFieldId: z.uuid().nullable().default(null).describe("Optional number or currency field that sizes the pins."),
    detailFieldId: z
      .uuid()
      .nullable()
      .default(null)
      .describe("Optional field shown in a pin's popover next to the record name and address."),
  })
  .strict();
export type MapWidgetQuery = z.infer<typeof MapWidgetQuerySchema>;

export const MapWidgetPointSchema = z
  .object({
    record: RecordRefSchema,
    title: CalculatedValueSchema,
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    precision: z.enum(["address", "postcode"]),
    address: z.string().describe("The one-line address."),
    color: z.string().nullable().describe("Option ID of the color field, or null."),
    size: CalculatedValueSchema.nullable(),
    detail: CalculatedValueSchema.nullable(),
  })
  .strict();
export type MapWidgetPoint = z.infer<typeof MapWidgetPointSchema>;

export const MapWidgetDataSchema = z
  .object({
    schemaRevision: z.number().int(),
    points: z.array(MapWidgetPointSchema).describe(`Located records, at most ${MAP_WIDGET_POINT_LIMIT}.`),
    total: z.number().int().describe("Records that match the source filters."),
    withoutLocation: z
      .number()
      .int()
      .describe("Matching records without an address, without a stored location, or whose address you cannot read."),
    truncated: z.boolean().describe(`True when more than ${MAP_WIDGET_POINT_LIMIT} records have a location.`),
  })
  .strict();
export type MapWidgetData = z.infer<typeof MapWidgetDataSchema>;

const MapWidgetDisplayOptionsSchema = z.object({ showFilters: z.boolean() }).strict();

const RecordMapWidgetFieldsSchema = z
  .object({
    kind: z.literal("map").describe("map. Optional on update; a saved widget keeps its kind."),
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(200),
    name: z.string().trim().min(1).max(255),
    mapQuery: MapWidgetQuerySchema,
    displayOptions: MapWidgetDisplayOptionsSchema,
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

export type SavedRecordMapWidgetInput = Omit<z.infer<typeof RecordMapWidgetFieldsSchema>, "kind"> & { kind?: "map" };

export const RecordMapWidgetInputSchema = RecordMapWidgetFieldsSchema.partial({
  kind: true,
  name: true,
  mapQuery: true,
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
  for (const key of ["name", "mapQuery"] as const) {
    if (value[key] === undefined)
      context.addIssue({ code: "custom", path: [key], message: "Creation requires this field" });
  }
});
export type RecordMapWidgetInput = z.infer<typeof RecordMapWidgetInputSchema>;

export const RecordMapWidgetDtoSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal("map"),
    version: z.number().int().positive(),
    userId: z.string(),
    companyId: z.string(),
    name: z.string(),
    mapQuery: MapWidgetQuerySchema,
    displayOptions: MapWidgetDisplayOptionsSchema,
    layout: WidgetLayoutSchema.nullable(),
    viewId: z.uuid().nullable(),
    isTemplate: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    data: MapWidgetDataSchema.nullable(),
    status: z.enum(["ready", "unavailable"]),
    fields: z
      .array(RecordDisplayFieldSchema)
      .describe("Definitions of the readable fields the widget shows, for formatting values and the legend."),
  })
  .strict();
export type RecordMapWidgetDto = z.infer<typeof RecordMapWidgetDtoSchema>;
export type StoredRecordMapWidget = Omit<RecordMapWidgetDto, "data" | "status" | "fields">;
