import type { RecordFileExtractionStatus } from "@/generated/prisma";
import type { RecordRef } from "@/features/records/record-model.schema";

import { z } from "zod";

import { RecordSearchHitSchema } from "@/features/records/record-search.schema";

const RECORD_FILE_SEARCH_MAX_RESULTS = 10;

export const RecordFileSearchSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(RECORD_FILE_SEARCH_MAX_RESULTS).default(5),
  })
  .strict();
export type RecordFileSearch = z.infer<typeof RecordFileSearchSchema>;

const RecordFileSearchHitSchema = z.object({
  id: z.uuid().describe("Id of the file; read it with GET /v1/files/{id} or manage_record_files read."),
  name: z.string(),
  mimeType: z.string(),
  fieldId: z.uuid().describe("File field that holds the file."),
  record: RecordSearchHitSchema.describe("The record whose file field holds the file."),
  snippet: z.string().describe("The matching passage of the file's text."),
  section: z.string().optional().describe("The heading or sheet of the matching passage."),
  offset: z.number().int().min(0).describe("Character offset of the passage; pass it as offset to read from there."),
});
export type RecordFileSearchHit = z.infer<typeof RecordFileSearchHitSchema>;

export const RecordFileSearchResultSchema = z.object({
  items: z.array(RecordFileSearchHitSchema),
  didYouMean: z.array(z.string()).optional().describe("Corrected spellings the results were found with."),
  retrieval: z.enum(["semantic", "keyword"]).describe("semantic when meaning-based ranking was used."),
});
export type RecordFileSearchResult = z.infer<typeof RecordFileSearchResultSchema>;

export const ReadRecordFileContentSchema = z.object({ fileId: z.uuid() }).strict();
export type ReadRecordFileContent = z.infer<typeof ReadRecordFileContentSchema>;

export type RecordFileContent = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  ref: RecordRef;
  fieldId: string;
  extraction: { status: RecordFileExtractionStatus; truncated: boolean; indexedAt: string | null };
  text: string | null;
};
