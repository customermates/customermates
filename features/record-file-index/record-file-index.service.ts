import type { FileStorageDriver } from "@/core/storage/file-storage-driver";
import type { RecordFileExtraction, RecordFileIndexCandidate, RecordFileIndexRepo } from "./record-file-index.repo";
import type { RecordFileSemanticIndexer } from "./record-file-semantic-indexer";

import * as Sentry from "@sentry/nextjs";

import { recordFileChunks } from "./record-file-chunks";
import { extractRecordFileText, RECORD_FILE_TEXT_MAX_BYTES, recordFileTextFormat } from "./record-file-text";

export const RECORD_FILE_INDEX_BATCH_FILES = 4;
export const RECORD_FILE_INDEX_MAX_ATTEMPTS = 3;
const RECORD_FILE_INDEX_STEP_BUDGET_MS = 60_000;

export type RecordFileIndexOutcome = { extracted: number; embedded: number; remaining: boolean };

export type RecordFileStorageResolver = (driver: string) => FileStorageDriver | null;

async function readBytes(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

export class RecordFileIndexService {
  constructor(
    private repo: RecordFileIndexRepo,
    private storage: RecordFileStorageResolver,
    private semantic: RecordFileSemanticIndexer,
    private budgetMs = RECORD_FILE_INDEX_STEP_BUDGET_MS,
  ) {}

  async indexPending(): Promise<RecordFileIndexOutcome> {
    const started = Date.now();
    const files = await this.repo.claimPendingFiles(RECORD_FILE_INDEX_BATCH_FILES);
    const begun = new Set<string>();
    let extracted = 0;
    try {
      for (const file of files) {
        if (Date.now() - started > this.budgetMs) break;
        begun.add(file.id);
        const attempts = await this.repo.startFileAttempt(file.id);
        if (attempts === null) continue;
        const extraction = await this.attempt(file, attempts);
        if (!extraction) continue;
        await this.repo.storeExtraction(file.id, extraction);
        extracted += 1;
      }
    } finally {
      await this.repo.releaseFileClaims(files.flatMap((file) => (begun.has(file.id) ? [] : [file.id])));
    }
    const extractionRemaining = extracted < files.length || files.length === RECORD_FILE_INDEX_BATCH_FILES;
    if (Date.now() - started > this.budgetMs) return { extracted, embedded: 0, remaining: true };
    const semantic = await this.semantic.embedPending();
    return {
      extracted,
      embedded: semantic.embedded,
      remaining: extractionRemaining || semantic.remaining,
    };
  }

  private async attempt(file: RecordFileIndexCandidate, attempts: number): Promise<RecordFileExtraction | null> {
    if (attempts > RECORD_FILE_INDEX_MAX_ATTEMPTS) return { status: "failed" };
    try {
      return await this.extraction(file);
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "record-file-index", fileId: file.id } });
      return attempts < RECORD_FILE_INDEX_MAX_ATTEMPTS ? null : { status: "failed" };
    }
  }

  private async extraction(file: RecordFileIndexCandidate): Promise<RecordFileExtraction> {
    const format = recordFileTextFormat(file.mimeType, file.name);
    if (!format) return { status: "unsupported" };
    if (file.size > RECORD_FILE_TEXT_MAX_BYTES) return { status: "skipped" };
    const reused = file.sha256 ? await this.repo.findExtractionBySha256(file.sha256, file.id) : null;
    if (reused)
      return reused.status === "done" ? { ...reused, chunks: recordFileChunks(file.name, reused.text) } : reused;
    const driver = this.storage(file.storageDriver);
    const stored = driver ? await driver.read(file.storageKey) : null;
    if (!stored) return { status: "failed" };
    const bytes = await readBytes(stored.stream, RECORD_FILE_TEXT_MAX_BYTES);
    if (!bytes) return { status: "skipped" };
    const text = await extractRecordFileText(bytes, format);
    return text.status === "done" ? { ...text, chunks: recordFileChunks(file.name, text.text) } : text;
  }
}
