import { z } from "zod";

import { CalculatedValueSchema, RecordRefSchema } from "./record-model.schema";
import { RecordQuerySchema } from "./record-query.schema";

export const RecordMeasureGroupFilterSchema = RecordQuerySchema.pick({
  search: true,
  filters: true,
  relationships: true,
  relatedFilters: true,
});

export const RecordMeasureSchema = z
  .object({
    source: RecordQuerySchema.omit({
      fields: true,
      includeRelationships: true,
      includePaths: true,
      sort: true,
      page: true,
      pageSize: true,
      grouping: true,
      groupPage: true,
      groupSummaries: true,
    }),
    aggregation: z.enum(["count", "sum", "average", "min", "max"]),
    valueFieldId: z.uuid().nullable(),
    groupBy: z
      .object({
        path: z
          .array(
            z
              .object({
                relationId: z.uuid(),
                direction: z.enum(["incoming", "outgoing"]),
              })
              .strict(),
          )
          .max(6),
        fieldId: z.uuid().nullable(),
        filter: RecordMeasureGroupFilterSchema.optional().describe(
          "Limit the terminal records that appear as groups using the same validated filters as record queries. Every path step requires access. Overall totals still use source filters; repeat relevant filters there to limit both contributions and groups.",
        ),
      })
      .strict()
      .nullable(),
    groupLimit: z.number().int().min(1).max(1000).default(100),
  })
  .strict();
export type RecordMeasure = z.infer<typeof RecordMeasureSchema>;

export function hasRecordMeasureGroupFilter(measure: RecordMeasure): boolean {
  const filter = measure.groupBy?.filter;
  return Boolean(
    filter?.search || filter?.filters?.length || filter?.relationships?.length || filter?.relatedFilters?.length,
  );
}

export const RecordMeasureResultSchema = z
  .object({
    schemaRevision: z.number().int(),
    attribution: z.literal("full"),
    total: z.object({ count: z.number().int(), result: CalculatedValueSchema }).strict(),
    groups: z.array(
      z
        .object({
          record: RecordRefSchema.nullable(),
          fieldId: z.uuid().nullable(),
          label: CalculatedValueSchema,
          count: z.number().int().nullable(),
          result: CalculatedValueSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type RecordMeasureResult = z.infer<typeof RecordMeasureResultSchema>;
