import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";

export const CHANNELS_SHEET_NAME = "Channels";

export const SERVICES_SHEET_NAME = "Services";

export const EXPORT_PAGE_SIZE = 500;

export const EXPORT_ROW_LIMIT = 50_000;

export const RequestedColumnSchema = z.object({
  key: z.string().trim().min(1).max(200),
  header: z.string().max(300),
});
export type RequestedColumnInput = Data<typeof RequestedColumnSchema>;

export const ExportRecordsPageSchema = z.object({
  entityType: z.enum(EntityType),
  columns: z.array(RequestedColumnSchema).min(1).max(200),
  filters: z.array(FilterSchema).optional(),
  searchTerm: z.string().max(500).optional(),
  sortDescriptor: SortDescriptorSchema.optional(),
  selectedIds: z.array(z.uuid()).max(EXPORT_ROW_LIMIT).optional(),
  skip: z.number().int().min(0).max(EXPORT_ROW_LIMIT),
  take: z.number().int().min(1).max(EXPORT_PAGE_SIZE),
});
export type ExportRecordsPageData = Data<typeof ExportRecordsPageSchema>;

export const ExportRequestSchema = ExportRecordsPageSchema.omit({ skip: true, take: true, entityType: true });
export type ExportRequestData = Data<typeof ExportRequestSchema>;

export const IMPORT_CHUNK_SIZE = 100;

export const IMPORT_ROW_LIMIT = 10_000;

export const ImportModeSchema = z.enum(["create", "update"]);
export type ImportMode = Data<typeof ImportModeSchema>;

export const DryRunImportSchema = z.object({
  mode: ImportModeSchema,
  rows: z.array(z.unknown()).min(1).max(IMPORT_CHUNK_SIZE),
});
export type DryRunImportData = Data<typeof DryRunImportSchema>;
