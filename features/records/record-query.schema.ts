import { z } from "zod";
import { FORMATTING_LOCALES, type FormattingLocale } from "@/i18n/locale-registry";

import {
  RecordFieldAssignmentSchema,
  RecordFieldUpdateSchema,
  RecordRefSchema,
  RecordScalarSchema,
  RecordGroupSummaryDefinitionSchema,
} from "./record-model.schema";
import { RecordFieldKeySchema, RecordRelationshipSelectionSchema, RecordSortKeySchema } from "./record-column.schema";
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
        "all",
        "between",
        "inLastDays",
        "notInLastDays",
      ])
      .describe(
        "For multiple choice fields in, all and notIn take option values and match records holding any, all or none of them. between uses two inclusive date endpoints in values; inLastDays and notInLastDays use a positive whole day count in value as a decimal without currency. Range contains tests a point; gt/gte test its start, lt/lte its end. Relative windows begin at UTC midnight that many days before the query clock: inLastDays includes later dates, notInLastDays matches only earlier ones.",
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
      .describe("Include registered identifiers for returned records of a type with Channels enabled."),
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

export const RecordReadSchema = RecordRefSchema.extend({
  includeRelationships: z
    .array(RecordRelationshipSelectionSchema)
    .max(32)
    .optional()
    .describe("Relationship summaries to return in relationships, as in query_crm_records. Omitted returns none."),
  includePaths: z
    .array(RecordPathSelectionSchema)
    .max(32)
    .optional()
    .describe("Declared relationship paths to summarize in relationshipPaths. Omitted returns none."),
}).strict();
export type RecordRead = z.infer<typeof RecordReadSchema>;

export const RecordLinkChangeSchema = z
  .object({
    action: z.enum(["link", "unlink"]),
    relationId: z.uuid(),
    direction: z.enum(["outgoing", "incoming"]),
    record: RecordRefSchema,
  })
  .strict();
export type RecordLinkChange = z.infer<typeof RecordLinkChangeSchema>;

export const RecordMutationTargetsSchema = z
  .array(
    z
      .object({
        ref: RecordRefSchema,
        expectedVersion: z.number().int().positive(),
      })
      .strict(),
  )
  .min(1)
  .max(100)
  .refine(
    (targets) => new Set(targets.map(({ ref }) => `${ref.typeId}:${ref.recordId}`)).size === targets.length,
    "Each record can appear only once in a bulk mutation",
  );

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
      fields: z.array(RecordFieldUpdateSchema).max(250),
      assignedUserIds: z.array(z.uuid()).max(100).optional(),
      captureFieldIds: z.array(z.uuid()).max(100).optional(),
      identities: RecordIdentityInputsSchema.optional(),
      linkChanges: z.array(RecordLinkChangeSchema).max(100).optional(),
      placement: z
        .object({
          afterRecordId: z.uuid().optional(),
          beforeRecordId: z.uuid().optional(),
          groupFieldId: z.uuid().optional(),
        })
        .strict()
        .optional()
        .describe(
          "Moves the record in its list's manual order (sort system:manual): right after afterRecordId, right before beforeRecordId, between both, or first when neither is given. With groupFieldId (a single choice input field, not a calculated one), the order is kept within records that share the record's value of that field, as in a board column. Changing only the order creates no new version, history entry or webhook.",
        ),
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
      permanent: z.boolean().optional(),
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
  z
    .object({
      action: z.literal("updateMany"),
      targets: RecordMutationTargetsSchema,
      fields: z.array(RecordFieldAssignmentSchema).max(250),
      assignedUserIds: z.array(z.uuid()).max(100).optional(),
      linkChanges: z.array(RecordLinkChangeSchema).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("deleteMany"),
      targets: RecordMutationTargetsSchema,
      expectedImpactHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      permanent: z.boolean().optional(),
    })
    .strict(),
]);
const [createMutation, updateMutation, deleteMutation, linkMutation] = ValidatedRecordMutationSchema.options;
export const RecordMutationSchema = z
  .object({
    action: z.enum(["create", "update", "delete", "link", "unlink", "updateMany", "deleteMany"]),
    targets: RecordMutationTargetsSchema.optional(),
    typeId: createMutation.shape.typeId.optional(),
    ref: updateMutation.shape.ref.optional(),
    expectedVersion: updateMutation.shape.expectedVersion.optional(),
    fields: updateMutation.shape.fields.optional(),
    assignedUserIds: createMutation.shape.assignedUserIds,
    identities: createMutation.shape.identities,
    links: createMutation.shape.links,
    linkChanges: updateMutation.shape.linkChanges,
    captureFieldIds: updateMutation.shape.captureFieldIds,
    placement: updateMutation.shape.placement,
    expectedImpactHash: deleteMutation.shape.expectedImpactHash,
    permanent: deleteMutation.shape.permanent,
    relationId: linkMutation.shape.relationId.optional(),
    source: linkMutation.shape.source.optional(),
    target: linkMutation.shape.target.optional(),
  })
  .strict()
  .describe(
    "create requires typeId and fields; update requires ref, expectedVersion and fields, where a field entry is { fieldId, value } or, for Formatted text and Text fields, { fieldId, append } to add text after the current value (an update that only appends never conflicts with a newer version); an update may carry placement to move the record in the list's manual order; delete requires ref and expectedVersion and moves the record (with its sub-list rows and cascaded records) to Trash, where it stays restorable for 30 days; permanent: true deletes it permanently right away and erases its values from history. link/unlink require relationId, source and target. updateMany/deleteMany require targets with each ref and expectedVersion; updateMany requires fields and applies the same patch to every target atomically; deleteMany moves every target to Trash (permanent: true deletes them permanently). Use only fields for that action.",
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

export const RestoreSummarySchema = z
  .object({
    restoredItemIds: z.array(z.uuid()),
    blocked: z.array(
      z
        .object({
          itemId: z.uuid(),
          reason: z.enum(["listDeleted", "parentDeleted", "notFound"]),
          typeId: z.uuid(),
          parent: RecordRefSchema.optional(),
        })
        .strict(),
    ),
    restoredRecords: z.number().int(),
    droppedLinks: z.number().int(),
  })
  .strict();

export const RecordOperationResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      refs: z.array(RecordRefSchema),
      schemaRevision: z.number().int(),
      trashBatchId: z.uuid().optional(),
      restore: RestoreSummarySchema.optional(),
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
