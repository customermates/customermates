import { z } from "zod";

import { RecordDtoSchema, RecordRefSchema } from "@/features/records/record-model.schema";

export const RECORD_EXPORT_LIMIT = 5_000;
export const RECORD_EXPORT_LINK_LIMIT = 50_000;
export const RECORD_IMPORT_LIMIT = 100;
export const RECORD_IMPORT_LINK_LIMIT = 500;

export const RecordExportLinkSchema = z
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
  })
  .strict();
export type RecordExport = z.infer<typeof RecordExportSchema>;

export const ImportRecordsSchema = z
  .object({
    document: RecordExportSchema,
    mode: z.enum(["create", "update"]),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();
export type ImportRecordsInput = z.infer<typeof ImportRecordsSchema>;
export const ImportRecordsResultSchema = z
  .object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    schemaRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ImportRecordsResult = z.infer<typeof ImportRecordsResultSchema>;
