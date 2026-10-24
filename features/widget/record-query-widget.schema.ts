import { z } from "zod";

import { RecordDisplayFieldSchema } from "@/features/records/record-display-field.schema";

import { WidgetLayoutSchema } from "./widget-display.schema";
import { WidgetPlacementSchema } from "./widget-grid";

export function recordQueryWidgetSchemas<
  Kind extends "calendar" | "map",
  Key extends `${Kind}Query`,
  Query extends z.ZodType,
  Data extends z.ZodType,
>(kind: Kind, key: Key, query: Query, data: Data, fieldsDescription: string) {
  const queryShape = { [key]: query } as { [K in Key]: Query };
  const displayOptions = z.object({ showFilters: z.boolean() }).strict();
  const fields = z
    .object({
      kind: z.literal(kind).describe(`${kind}. Optional on update; a saved widget keeps its kind.`),
      id: z.uuid().optional(),
      expectedVersion: z.number().int().positive().optional(),
      expectedRevision: z.number().int().nonnegative(),
      idempotencyKey: z.string().min(8).max(200),
      name: z.string().trim().min(1).max(255),
      ...queryShape,
      displayOptions,
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
  const optionalOnUpdate = { [key]: true } as { [K in Key]: true };
  const input = fields
    .partial({ kind: true, name: true, ...optionalOnUpdate, displayOptions: true, isTemplate: true })
    .superRefine((parsed, context) => {
      const value = parsed as Record<string, unknown>;
      if (Boolean(value.id) !== Boolean(value.expectedVersion)) {
        context.addIssue({
          code: "custom",
          path: ["expectedVersion"],
          message: "Updates require the saved widget version",
        });
      }
      if (value.id) return;
      for (const field of ["name", key]) {
        if (value[field] === undefined)
          context.addIssue({ code: "custom", path: [field], message: "Creation requires this field" });
      }
    });
  const dto = z
    .object({
      id: z.uuid(),
      kind: z.literal(kind),
      version: z.number().int().positive(),
      userId: z.string(),
      companyId: z.string(),
      name: z.string(),
      ...queryShape,
      displayOptions,
      layout: WidgetLayoutSchema.nullable(),
      viewId: z.uuid().nullable(),
      isTemplate: z.boolean(),
      createdAt: z.date(),
      updatedAt: z.date(),
      data: data.nullable(),
      status: z.enum(["ready", "unavailable"]),
      fields: z.array(RecordDisplayFieldSchema).describe(fieldsDescription),
    })
    .strict();
  return { fields, input, dto };
}
