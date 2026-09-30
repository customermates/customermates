import { z } from "zod";

import {
  CalculatedValueSchema,
  RecordFieldSchema,
  RecordRefSchema,
  RecordValueTypeSchema,
} from "./record-model.schema";
import { RecordIdentitySchema } from "./record-identity.schema";

export const RecordHistoryPublicationSchema = z.object({ fieldId: z.uuid(), dependencyHash: z.string() }).strict();

export const RecordHistoryValueSchema = z
  .object({
    fieldId: z.uuid(),
    label: z.string(),
    valueType: RecordValueTypeSchema,
    format: RecordFieldSchema.shape.format,
    options: RecordFieldSchema.shape.options.default([]),
    value: CalculatedValueSchema,
    sources: z.array(RecordRefSchema),
    publications: z.array(RecordHistoryPublicationSchema),
    publishedSummary: z.boolean(),
    dependencyHash: z.string(),
  })
  .strict();

export const RecordHistoryIdentitySchema = RecordIdentitySchema.pick({
  id: true,
  provider: true,
  value: true,
  messagingId: true,
  displayName: true,
  profileUrl: true,
});

export const RecordHistorySnapshotSchema = z
  .object({
    version: z.number().int().positive(),
    assignedUserIds: z.array(z.uuid()),
    values: z.array(RecordHistoryValueSchema),
    identities: z.array(RecordHistoryIdentitySchema),
  })
  .strict();

export const RecordEventLinkSchema = z
  .object({
    relationId: z.uuid(),
    source: RecordRefSchema,
    target: RecordRefSchema,
    before: z.boolean(),
    after: z.boolean(),
  })
  .strict();

export const RecordJournalEntrySchema = z
  .object({
    ref: RecordRefSchema,
    before: RecordHistorySnapshotSchema.nullable(),
    links: z.array(RecordEventLinkSchema),
  })
  .strict();

export const RecordEventPayloadSchema = z
  .object({
    version: z.literal(2),
    ref: RecordRefSchema,
    schemaRevision: z.number().int().positive(),
    cause: z
      .object({
        kind: z.enum(["mutation", "configuration", "system"]),
        operationId: z.uuid().optional(),
        routineDepth: z.number().int().nonnegative().optional(),
      })
      .strict(),
    beforeVersion: z.number().int().positive().nullable(),
    afterVersion: z.number().int().positive().nullable(),
    changedFieldIds: z.array(z.uuid()),
    fields: z.array(
      z.object({
        fieldId: z.uuid(),
        before: RecordHistoryValueSchema.nullable(),
        after: RecordHistoryValueSchema.nullable(),
      }),
    ),
    assignments: z.object({ before: z.array(z.uuid()), after: z.array(z.uuid()) }).nullable(),
    identities: z
      .object({ before: z.array(RecordHistoryIdentitySchema), after: z.array(RecordHistoryIdentitySchema) })
      .nullable(),
    links: z.array(RecordEventLinkSchema),
  })
  .strict();

export type RecordHistoryValue = z.infer<typeof RecordHistoryValueSchema>;
export type RecordHistorySnapshot = z.infer<typeof RecordHistorySnapshotSchema>;
export type RecordJournalEntry = z.infer<typeof RecordJournalEntrySchema>;
export type RecordEventPayload = z.infer<typeof RecordEventPayloadSchema>;

export const RecordHistoryDisplayValueSchema = RecordHistoryValueSchema.pick({
  fieldId: true,
  label: true,
  valueType: true,
  format: true,
  options: true,
  value: true,
});
export const RecordHistoryChangesSchema = RecordEventPayloadSchema.pick({
  ref: true,
  schemaRevision: true,
  beforeVersion: true,
  afterVersion: true,
  assignments: true,
  identities: true,
  links: true,
}).extend({
  related: z
    .array(
      z
        .object({
          label: z.string(),
          before: z.array(z.object({ ref: RecordRefSchema, title: z.string() }).strict()),
          after: z.array(z.object({ ref: RecordRefSchema, title: z.string() }).strict()),
        })
        .strict(),
    )
    .default([]),
  fields: z.array(
    z.object({
      fieldId: z.uuid(),
      before: RecordHistoryDisplayValueSchema.nullable(),
      after: RecordHistoryDisplayValueSchema.nullable(),
    }),
  ),
});
