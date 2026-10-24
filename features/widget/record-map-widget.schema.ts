import { z } from "zod";

import { CalculatedValueSchema, RecordRefSchema } from "@/features/records/record-model.schema";

import { recordQueryWidgetSchemas } from "./record-query-widget.schema";
import { RecordWidgetSourceSchema } from "./record-widget-source.schema";

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

const MapWidgetPointSchema = z
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

const MapWidgetDataSchema = z
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

const MAP_WIDGET = recordQueryWidgetSchemas(
  "map",
  "mapQuery",
  MapWidgetQuerySchema,
  MapWidgetDataSchema,
  "Definitions of the readable fields the widget shows, for formatting values and the legend.",
);

export type SavedRecordMapWidgetInput = Omit<z.infer<typeof MAP_WIDGET.fields>, "kind"> & { kind?: "map" };

export const RecordMapWidgetInputSchema = MAP_WIDGET.input;
export type RecordMapWidgetInput = z.infer<typeof RecordMapWidgetInputSchema>;

export const RecordMapWidgetDtoSchema = MAP_WIDGET.dto;
export type RecordMapWidgetDto = z.infer<typeof RecordMapWidgetDtoSchema>;
export type StoredRecordMapWidget = Omit<RecordMapWidgetDto, "data" | "status" | "fields">;
