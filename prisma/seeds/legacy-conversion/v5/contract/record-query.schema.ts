import { z } from "zod";

import { RecordScalarSchema, RecordGroupSummaryDefinitionSchema } from "./record-model.schema";
import { RecordFieldKeySchema, RecordRelationshipSelectionSchema } from "./record-column.schema";
import { RecordPathSelectionSchema } from "./record-relationship-path.schema";
import { GroupingSchema, GroupPageRequestSchema } from "./grouping.schema";

export const RecordFilterSchema = z
  .object({
    fieldId: RecordFieldKeySchema,
    operator: z
      .enum([
        "eq",
        "ne",
        "contains",
        "startsWith",
        "gt",
        "gte",
        "lt",
        "lte",
        "empty",
        "notEmpty",
        "in",
        "notIn",
        "between",
        "inLastDays",
      ])
      .describe(
        "between uses two inclusive date endpoints in values; inLastDays uses a positive whole day count in value as a decimal without currency. Range contains tests a point; gt/gte test its start, lt/lte its end. Relative windows begin at UTC midnight that many days before the query clock, including later dates.",
      ),
    value: RecordScalarSchema.nullable(),
    values: z.array(RecordScalarSchema).max(100).optional(),
  })
  .strict();

export const RecordRelationshipFilterSchema = z
  .object({
    relationId: z.uuid(),
    direction: z.enum(["outgoing", "incoming"]),
    operator: z.enum(["any", "none"]),
    recordIds: z.array(z.uuid()).max(100).nullable(),
  })
  .strict();

export const RecordRelatedFilterSchema = z
  .object({
    path: z
      .array(z.object({ relationId: z.uuid(), direction: z.enum(["outgoing", "incoming"]) }).strict())
      .min(1)
      .max(6),
    operator: z.enum(["any", "none"]),
    filters: z.array(RecordFilterSchema).max(50),
    relationships: z.array(RecordRelationshipFilterSchema).max(50).default([]),
    search: z.string().trim().max(500).optional(),
    recordIds: z
      .array(z.uuid())
      .max(100)
      .optional()
      .describe("Match these terminal record identities after following the path; all steps require record access."),
  })
  .strict();

export const RecordQuerySchema = z
  .object({
    typeId: z.uuid(),
    locale: z.enum(["en", "de", "es", "fr", "it"]).optional(),
    fields: z.array(z.uuid()).max(100).optional(),
    includeRelationships: z.array(RecordRelationshipSelectionSchema).max(32).optional(),
    includePaths: z.array(RecordPathSelectionSchema).max(32).optional(),
    includeIdentities: z
      .boolean()
      .optional()
      .describe("Include identity channels for returned records of a person-identity bound type."),
    search: z.string().trim().max(500).optional(),
    filters: z.array(RecordFilterSchema).max(50).default([]),
    relatedFilters: z.array(RecordRelatedFilterSchema).max(16).optional(),
    relationships: z.array(RecordRelationshipFilterSchema).max(50).default([]),
    sort: z
      .array(z.object({ fieldId: RecordFieldKeySchema, direction: z.enum(["asc", "desc"]) }).strict())
      .max(5)
      .default([]),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(500).default(25),
    grouping: GroupingSchema.optional().describe(
      "Group by a field, system column or relationship column. Date buckets use UTC boundaries; weeks start on Sunday. At most 50 value groups and one empty group are supported per query; narrow filters for larger axes.",
    ),
    groupPage: GroupPageRequestSchema.optional().describe(
      "Requires grouping. Defaults to 10 records per group, at most 25 materialized groups and 1000 unique records. Use a returned group key in only and overrides to load another page; collapsed groups retain counts without loading records.",
    ),
    groupSummaries: z
      .array(RecordGroupSummaryDefinitionSchema)
      .max(8)
      .optional()
      .describe(
        "Requires grouping. Aggregate numeric fields over every record in each group, independent of pagination. Relationship groups use full attribution; a source record contributes once per group. Restricted inputs hide the entire summary.",
      ),
  })
  .strict();
export type RecordQuery = z.infer<typeof RecordQuerySchema>;
