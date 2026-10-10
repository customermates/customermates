import { z } from "zod";

import { CalculatedValueSchema, RecordRefSchema } from "./record-model.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { RecordFieldKeySchema } from "./record-column.schema";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export const RECORD_MEASURE_DATE_INTERVALS = ["day", "week", "month", "quarter", "year"] as const;
export type RecordMeasureDateInterval = (typeof RECORD_MEASURE_DATE_INTERVALS)[number];
export const RECORD_MEASURE_DEFAULT_GROUP_LIMIT = 100;
export const RECORD_MEASURE_MAX_GROUP_LIMIT = 1000;

export function isRecordMeasureTimeZone(timeZone: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(timeZone)) return false;
  try {
    return Boolean(new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone }).resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

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
        fieldId: RecordFieldKeySchema.nullable().describe(
          "A field ID on the terminal type, system:createdAt, system:updatedAt or system:assignedTo, or null to group by each terminal record. Assignee groups use full attribution: a record with several assignees contributes to each.",
        ),
        dateInterval: z
          .enum(RECORD_MEASURE_DATE_INTERVALS)
          .optional()
          .describe(
            "Bucket a date or dateTime field, system:createdAt or system:updatedAt into calendar periods. Rejected for any other grouping. Weeks start on Monday (ISO). Each group label is the bucket start as a date (YYYY-MM-DD); groups are returned in chronological order and only periods with records appear. Records without a date form the missing group. Every bucket counts toward groupLimit; raise it up to 1000 for long daily series.",
          ),
        timeZone: z
          .string()
          .min(1)
          .max(64)
          .refine(isRecordMeasureTimeZone, "Use an IANA time zone such as Europe/Berlin")
          .optional()
          .describe(
            "IANA time zone that dateTime values and system timestamps are bucketed in. Requires dateInterval; defaults to UTC. Date-only values are calendar dates and never shift.",
          ),
        filter: RecordMeasureGroupFilterSchema.optional().describe(
          "Limit the terminal records that appear as groups using the same validated filters as record queries. Every path step requires access. Overall totals still use source filters; repeat relevant filters there to limit both contributions and groups.",
        ),
      })
      .strict()
      .nullable(),
    groupLimit: z
      .number()
      .int()
      .min(1)
      .max(RECORD_MEASURE_MAX_GROUP_LIMIT)
      .default(RECORD_MEASURE_DEFAULT_GROUP_LIMIT)
      .describe(
        "Maximum number of groups, including the missing group. A measure with more groups fails instead of truncating.",
      ),
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
          fieldId: RecordFieldKeySchema.nullable(),
          label: CalculatedValueSchema,
          count: z.number().int().nullable(),
          result: CalculatedValueSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type RecordMeasureResult = z.infer<typeof RecordMeasureResultSchema>;
