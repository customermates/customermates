import type { RecordFileChunkDraft } from "./record-file-chunks";

export type RecordFileIndexCandidate = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string | null;
  storageDriver: string;
  storageKey: string;
  indexAttempts: number;
};

export type RecordFileExtraction =
  | { status: "done"; text: string; truncated: boolean; chunks: RecordFileChunkDraft[] }
  | { status: "noText" | "unsupported" | "failed" | "skipped" };

export type ReusableRecordFileExtraction =
  | { status: "done"; text: string; truncated: boolean }
  | { status: "noText" | "unsupported" };

export abstract class RecordFileIndexRepo {
  abstract claimPendingFiles(limit: number): Promise<RecordFileIndexCandidate[]>;
  abstract startFileAttempt(fileId: string): Promise<number | null>;
  abstract findExtractionBySha256(sha256: string, exceptFileId: string): Promise<ReusableRecordFileExtraction | null>;
  abstract storeExtraction(fileId: string, extraction: RecordFileExtraction): Promise<void>;
  abstract releaseFileClaims(fileIds: string[]): Promise<void>;
  abstract companiesWithStalledFilesUnscoped(pendingBefore: Date, limit: number): Promise<string[]>;
}
