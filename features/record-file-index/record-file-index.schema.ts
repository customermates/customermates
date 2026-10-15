import type { RecordFileExtractionStatus } from "@/generated/prisma";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordSearchHit } from "@/features/records/record-search.schema";

import { z } from "zod";

export const RECORD_FILE_SEARCH_MAX_RESULTS = 10;

export const RecordFileSearchSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(RECORD_FILE_SEARCH_MAX_RESULTS).default(5),
  })
  .strict();
export type RecordFileSearch = z.infer<typeof RecordFileSearchSchema>;

export type RecordFileSearchHit = {
  id: string;
  name: string;
  mimeType: string;
  fieldId: string;
  record: RecordSearchHit;
  snippet: string;
  section?: string;
  offset: number;
};

export type RecordFileSearchResult = {
  items: RecordFileSearchHit[];
  didYouMean?: string[];
  retrieval: "semantic" | "keyword";
};

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
