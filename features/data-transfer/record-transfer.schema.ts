import { z } from "zod";

import { RecordDtoSchema, RecordRefSchema } from "@/features/records/record-model.schema";
import { MarkedRecordDtoSchema } from "@/features/mcp-tools/untrusted-record-content";

export const RECORD_EXPORT_LIMIT = 5_000;
export const RECORD_EXPORT_LINK_LIMIT = 50_000;
export const RECORD_IMPORT_LIMIT = 100;
export const RECORD_IMPORT_LINK_LIMIT = 500;

const RecordExportLinkSchema = z
  .object({ relationId: z.uuid(), source: RecordRefSchema, target: RecordRefSchema })
  .strict();
export type RecordExportLink = z.infer<typeof RecordExportLinkSchema>;
export const RecordExportSchema = z
  .object({
    format: z.literal("customermates-records"),
    version: z.literal(1),
    typeId: z.uuid(),
    schemaRevision: z.number().int().nonnegative(),
    exportedAt: z.iso.datetime(),
    records: z.array(RecordDtoSchema).max(RECORD_EXPORT_LIMIT),
    links: z.array(RecordExportLinkSchema).max(RECORD_EXPORT_LINK_LIMIT),
    total: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Paged exports only: how many top-level records match in total."),
    nextPage: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .describe("Paged exports only: the page to request next with the same query, or null after the last page."),
  })
  .strict();
export type RecordExport = z.infer<typeof RecordExportSchema>;

const sparseRow = {
  version: true,
  schemaRevision: true,
  createdAt: true,
  updatedAt: true,
  assignedUserIds: true,
} as const;
const ImportRecordRowSchema = RecordDtoSchema.partial(sparseRow).extend({
  fields: RecordDtoSchema.shape.fields.default([]),
});
const ImportDocumentSchema = RecordExportSchema.extend({
  exportedAt: RecordExportSchema.shape.exportedAt.optional(),
  records: z.array(ImportRecordRowSchema).max(RECORD_EXPORT_LIMIT),
  links: RecordExportSchema.shape.links.default([]),
  unlinks: z
    .array(RecordExportLinkSchema)
    .max(RECORD_IMPORT_LINK_LIMIT)
    .optional()
    .describe("Update mode only: links to remove from the listed records."),
}).strict();

export const ImportRecordsSchema = z
  .object({
    document: ImportDocumentSchema,
    mode: z.enum(["create", "update"]),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();
export type ImportRecordsInput = z.infer<typeof ImportRecordsSchema>;
export const ImportMarkedRecordsSchema = ImportRecordsSchema.extend({
  document: ImportDocumentSchema.extend({
    records: z
      .array(
        MarkedRecordDtoSchema.partial(sparseRow).extend({
          fields: MarkedRecordDtoSchema.shape.fields.default([]),
        }),
      )
      .max(RECORD_EXPORT_LIMIT),
    untrustedTextHandling: z
      .string()
      .optional()
      .describe("Export-only note from export_crm_records. Accepted so the export can be passed back as-is; ignored."),
  }).strict(),
}).strict();
export type ImportMarkedRecordsInput = z.infer<typeof ImportMarkedRecordsSchema>;
export const ImportRecordsResultSchema = z
  .object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    unlinked: z.number().int().nonnegative().optional(),
    schemaRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ImportRecordsResult = z.infer<typeof ImportRecordsResultSchema>;
