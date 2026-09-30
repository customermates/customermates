import { z } from "zod";
import { FORMATTING_LOCALES, type FormattingLocale } from "@/i18n/locale-registry";

import {
  RecordFieldAssignmentSchema,
  RecordRefSchema,
  RecordScalarSchema,
  RecordGroupSummaryDefinitionSchema,
} from "./record-model.schema";
import { RecordFieldKeySchema, RecordRelationshipSelectionSchema } from "./record-column.schema";
import { RecordIdentityInputsSchema } from "./record-identity.schema";
import { RecordPathSelectionSchema } from "./record-relationship-path.schema";
import { GroupingSchema, GroupPageRequestSchema } from "@/core/base/grouping/grouping.schema";

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
    locale: z.enum([...FORMATTING_LOCALES] as [FormattingLocale, ...FormattingLocale[]]).optional(),
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

export const RecordLinkChangeSchema = z
  .object({
    action: z.enum(["link", "unlink"]),
    relationId: z.uuid(),
    direction: z.enum(["outgoing", "incoming"]),
    record: RecordRefSchema,
  })
  .strict();
export type RecordLinkChange = z.infer<typeof RecordLinkChangeSchema>;

const ValidatedRecordMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      typeId: z.uuid(),
      fields: z.array(RecordFieldAssignmentSchema).max(250),
      assignedUserIds: z.array(z.uuid()).max(100).optional(),
      identities: RecordIdentityInputsSchema.optional(),
      links: z
        .array(
          z
            .object({
              relationId: z.uuid(),
              direction: z.enum(["outgoing", "incoming"]),
              record: RecordRefSchema,
            })
            .strict(),
        )
        .max(100)
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      ref: RecordRefSchema,
      expectedVersion: z.number().int().positive(),
      fields: z.array(RecordFieldAssignmentSchema).max(250),
      assignedUserIds: z.array(z.uuid()).max(100).optional(),
      captureFieldIds: z.array(z.uuid()).max(100).optional(),
      identities: RecordIdentityInputsSchema.optional(),
      linkChanges: z.array(RecordLinkChangeSchema).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      ref: RecordRefSchema,
      expectedVersion: z.number().int().positive(),
      expectedImpactHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("link"),
      relationId: z.uuid(),
      source: RecordRefSchema,
      target: RecordRefSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("unlink"),
      relationId: z.uuid(),
      source: RecordRefSchema,
      target: RecordRefSchema,
    })
    .strict(),
]);
const [createMutation, updateMutation, deleteMutation, linkMutation] = ValidatedRecordMutationSchema.options;
export const RecordMutationSchema = z
  .object({
    action: z.enum(["create", "update", "delete", "link", "unlink"]),
    typeId: createMutation.shape.typeId.optional(),
    ref: updateMutation.shape.ref.optional(),
    expectedVersion: updateMutation.shape.expectedVersion.optional(),
    fields: createMutation.shape.fields.optional(),
    assignedUserIds: createMutation.shape.assignedUserIds,
    identities: createMutation.shape.identities,
    links: createMutation.shape.links,
    linkChanges: updateMutation.shape.linkChanges,
    captureFieldIds: updateMutation.shape.captureFieldIds,
    expectedImpactHash: deleteMutation.shape.expectedImpactHash,
    relationId: linkMutation.shape.relationId.optional(),
    source: linkMutation.shape.source.optional(),
    target: linkMutation.shape.target.optional(),
  })
  .strict()
  .describe(
    "create requires typeId and fields; update requires ref, expectedVersion and fields; delete requires ref and expectedVersion; link/unlink require relationId, source and target. Use only fields for that action.",
  )
  .transform((input, ctx) => {
    const parsed = ValidatedRecordMutationSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
      return z.NEVER;
    }
    return parsed.data;
  });
export const MutateRecordSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(200),
    mutation: RecordMutationSchema,
  })
  .strict();
export type RecordMutation = z.infer<typeof RecordMutationSchema>;
export type MutateRecordInput = z.infer<typeof MutateRecordSchema>;

export const RecordOperationResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      refs: z.array(RecordRefSchema),
      schemaRevision: z.number().int(),
    })
    .strict(),
  z
    .object({
      status: z.literal("pending"),
      operationId: z.uuid(),
      schemaRevision: z.number().int(),
    })
    .strict(),
]);
export type RecordOperationResult = z.infer<typeof RecordOperationResultSchema>;

export type RecordReadScope = {
  userId: string;
  access: "all" | "own" | "none";
  parent?: { relationId: string; typeId: string; scope: RecordReadScope };
};
export type RecordAccessMap = Map<string, RecordReadScope>;
