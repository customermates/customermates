import { z } from "zod";
import { FORMATTING_LOCALES, type FormattingLocale } from "@/i18n/locale-registry";
import { RecordScalarSchema, RecordGroupSummaryDefinitionSchema } from "./record-model.schema";
import { RecordFieldKeySchema, RecordRelationshipSelectionSchema, RecordSortKeySchema } from "./record-column.schema";
import { RecordPathSelectionSchema } from "./record-relationship-path.schema";
import { GroupingSchema, GroupPageRequestSchema } from "@/core/base/grouping/grouping.schema";

const RecordFilterSchema = z
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
        "all",
        "between",
        "overlaps",
        "inLastDays",
        "notInLastDays",
      ])
      .describe(
        "For multiple choice fields in, all and notIn take option values and match records holding any, all or none of them. between uses two inclusive date endpoints in values; overlaps takes the same endpoints and also matches a date range that only partly falls between them; a range without an end counts as its start day. inLastDays and notInLastDays use a positive whole day count in value as a decimal without currency. Range contains tests a point; gt/gte test its start, lt/lte its end. Relative windows begin at UTC midnight that many days before the query clock: inLastDays includes later dates, notInLastDays matches only earlier ones.",
      ),
    value: RecordScalarSchema.nullable(),
    values: z.array(RecordScalarSchema).max(100).optional(),
  })
  .strict();

const RecordRelationshipFilterSchema = z
  .object({
    relationId: z.uuid(),
    direction: z.enum(["outgoing", "incoming"]),
    operator: z.enum(["any", "none"]),
    recordIds: z.array(z.uuid()).max(100).nullable(),
  })
  .strict();

const RecordRelatedFilterSchema = z
  .object({
    path: z
      .array(
        z
          .object({
            relationId: z.uuid(),
            direction: z.enum(["outgoing", "incoming"]),
          })
          .strict(),
      )
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

export const RecordQueryBaseSchema = z
  .object({
    typeId: z.uuid(),
    locale: z.enum([...FORMATTING_LOCALES] as [FormattingLocale, ...FormattingLocale[]]).optional(),
    fields: z.array(z.uuid()).max(100).optional(),
    includeRelationships: z.array(RecordRelationshipSelectionSchema).max(32).optional(),
    includePaths: z.array(RecordPathSelectionSchema).max(32).optional(),
    includeIdentities: z
      .boolean()
      .optional()
      .describe(
        "Include registered identifiers for returned records of a list with a contact details (channels) field.",
      ),
    search: z.string().trim().max(500).optional(),
    filters: z.array(RecordFilterSchema).max(50).default([]),
    relatedFilters: z.array(RecordRelatedFilterSchema).max(16).optional(),
    relationships: z.array(RecordRelationshipFilterSchema).max(50).default([]),
    sort: z
      .array(
        z
          .object({
            fieldId: RecordSortKeySchema.describe(
              "A sortable field id, system:createdAt, system:updatedAt, or system:manual (the list's manual order, asc only).",
            ),
            direction: z.enum(["asc", "desc"]),
          })
          .strict(),
      )
      .max(5)
      .default([]),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(500).default(25),
    grouping: GroupingSchema.omit({ summaries: true })
      .optional()
      .describe(
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
