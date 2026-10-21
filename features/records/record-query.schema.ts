import { RecordQueryBaseSchema } from "./record-query-base.schema";
import { RecordContributionSchema } from "./record-contribution.schema";
import { z } from "zod";

import { RecordFieldAssignmentSchema, RecordFieldUpdateSchema, RecordRefSchema } from "./record-model.schema";
import { RecordRelationshipSelectionSchema } from "./record-column.schema";
import { RecordIdentityInputsSchema } from "./record-identity.schema";
import { RecordPathSelectionSchema } from "./record-relationship-path.schema";
import { DeletionCleanupSchema } from "./configuration.schema";

export const RecordQuerySchema = RecordQueryBaseSchema.extend({
  contribution: RecordContributionSchema.optional().describe(
    "Restrict the list to the exact source records contributing to a chart or one of its groups.",
  ),
});
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

const RecordLinkChangeSchema = z
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

const ExpectedImpactHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .optional()
  .describe(
    "Optional. When given, it must equal the impactHash of a current deletion preview (POST /v1/records/preview-deletion); the delete fails with a conflict if the impact changed since.",
  );

const RECORD_MUTATION_DESCRIPTION =
  "create requires typeId and fields; update requires ref, expectedVersion and fields, where a field entry is { fieldId, value } or, for Formatted text and Text fields, { fieldId, append } to add text after the current value (an update that only appends never conflicts with a newer version); an update may carry placement to move the record in the list's manual order; delete requires ref and expectedVersion and moves the record (with its sub-list rows and cascaded records) to Trash, where it stays restorable for 30 days; permanent: true deletes it permanently right away and erases its values from history. link/unlink require relationId, source and target. updateMany/deleteMany require targets with each ref and expectedVersion; updateMany requires fields and applies the same patch to every target atomically; deleteMany moves every target to Trash (permanent: true deletes them permanently). Use only fields for that action. Phone numbers, email addresses and social profiles are not fields: create and update carry them as identities inside this mutation object (with fields: [] when nothing else changes), and the list replaces the record's contact details, so include the ones to keep.";

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
      expectedImpactHash: ExpectedImpactHashSchema,
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
      expectedImpactHash: ExpectedImpactHashSchema,
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
  .describe(RECORD_MUTATION_DESCRIPTION)
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
export const MutateRecordRequestSchema = MutateRecordSchema.extend({
  mutation: ValidatedRecordMutationSchema.describe(RECORD_MUTATION_DESCRIPTION),
});
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

export const RECORD_WRITE_WARNING_CODES = [
  "countryMissing",
  "partMissing",
  "regionUnknown",
  "postalCodeRegionMismatch",
  "cityMismatch",
] as const;

export const RecordWriteWarningSchema = z
  .object({
    code: z
      .enum(RECORD_WRITE_WARNING_CODES)
      .describe(
        "Address check that did not block the write: countryMissing (a postal code or region without a country, so neither was checked), partMissing (an address with a street lacks a part the country's postal format needs), regionUnknown (not one of the country's regions), postalCodeRegionMismatch (the postal code belongs to another region), cityMismatch (the city does not belong to the postal code in the postal code directory).",
      ),
    fieldId: z.string(),
    recordIds: z.array(z.string()).min(1).max(20).describe("The records it applies to, at most 20."),
    part: z.enum(["street", "postalCode", "city", "region", "countryCode"]).describe("The address part concerned."),
    expected: z
      .array(z.string())
      .max(5)
      .optional()
      .describe("cityMismatch: cities of the postal code; postalCodeRegionMismatch: its region keys."),
    message: z.string().describe("The warning as an English sentence."),
  })
  .strict();
export type RecordWriteWarning = z.infer<typeof RecordWriteWarningSchema>;

export const RecordOperationResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      refs: z.array(RecordRefSchema),
      references: z
        .array(z.object({ reference: z.string(), id: z.uuid() }).strict())
        .optional()
        .describe("Data model changes only: the id created or resolved for each reference in the change."),
      schemaRevision: z.number().int(),
      trashBatchId: z.uuid().optional(),
      deletionCleaned: z
        .array(DeletionCleanupSchema)
        .optional()
        .describe("Data model deletion only: views, layouts and widgets changed automatically."),
      restore: RestoreSummarySchema.optional(),
      warnings: z
        .array(RecordWriteWarningSchema)
        .optional()
        .describe(
          "Address values were saved but look incomplete or implausible; correct them with another update where the user agrees.",
        ),
    })
    .strict(),
  z
    .object({
      status: z.literal("pending"),
      operationId: z.uuid(),
      schemaRevision: z.number().int(),
      deletionCleaned: z.array(DeletionCleanupSchema).optional(),
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
