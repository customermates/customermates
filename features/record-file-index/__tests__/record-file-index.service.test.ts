import type { FileStorageDriver } from "@/core/storage/file-storage-driver";
import type {
  RecordFileExtraction,
  RecordFileIndexCandidate,
  RecordFileIndexRepo,
  ReusableRecordFileExtraction,
} from "../record-file-index.repo";

import { describe, expect, it, vi } from "vitest";

import { pdfFixture } from "@/tests/helpers/record-file-fixtures";

import {
  RECORD_FILE_INDEX_BATCH_FILES,
  RECORD_FILE_INDEX_MAX_ATTEMPTS,
  RecordFileIndexService,
} from "../record-file-index.service";
import { RECORD_FILE_TEXT_MAX_BYTES } from "../record-file-text";

function candidate(overrides: Partial<RecordFileIndexCandidate> = {}): RecordFileIndexCandidate {
  return {
    id: "file-1",
    name: "notes.txt",
    mimeType: "text/plain",
    size: 20,
    sha256: null,
    storageDriver: "database",
    storageKey: "company/file-1",
    indexAttempts: 0,
    ...overrides,
  };
}

function storage(contents: Record<string, Uint8Array>) {
  const read = vi.fn((key: string) => {
    const bytes = contents[key];
    if (!bytes) return Promise.resolve(null);
    return Promise.resolve({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      size: bytes.byteLength,
      contentType: null,
    });
  });
  return { read, driver: { name: "database", read } as unknown as FileStorageDriver };
}

function setup(
  files: RecordFileIndexCandidate[],
  contents: Record<string, Uint8Array>,
  reusable: ReusableRecordFileExtraction | null = null,
) {
  const stored = new Map<string, RecordFileExtraction>();
  const attempts = new Map(files.map((file) => [file.id, file.indexAttempts]));
  const repo = {
    claimPendingFiles: vi.fn(() => Promise.resolve(files)),
    startFileAttempt: vi.fn((id: string): Promise<number | null> => {
      const next = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, next);
      return Promise.resolve(next);
    }),
    findExtractionBySha256: vi.fn(() => Promise.resolve(reusable)),
    storeExtraction: vi.fn((id: string, extraction: RecordFileExtraction) => {
      stored.set(id, extraction);
      return Promise.resolve();
    }),
    releaseFileClaims: vi.fn(() => Promise.resolve()),
    companiesWithStalledFilesUnscoped: vi.fn(() => Promise.resolve([])),
  } satisfies RecordFileIndexRepo;
  const files_ = storage(contents);
  const semantic = { embedPending: vi.fn(() => Promise.resolve({ embedded: 2, remaining: false })) };
  const service = new RecordFileIndexService(
    repo,
    (driver) => (driver === "database" ? files_.driver : null),
    semantic,
  );
  return { service, repo, stored, attempts, read: files_.read, semantic };
}

describe("record file index service", () => {
  it("extracts and chunks a claimed file, then embeds pending chunks", async () => {
    const f = setup([candidate()], { "company/file-1": new TextEncoder().encode("Renewal terms apply.") });

    await expect(f.service.indexPending()).resolves.toEqual({ extracted: 1, embedded: 2, remaining: false });
    expect(f.stored.get("file-1")).toMatchObject({
      status: "done",
      text: "Renewal terms apply.",
      truncated: false,
      chunks: [{ ordinal: 0, offset: 0, heading: null, text: "notes.txt\n\nRenewal terms apply." }],
    });
    expect(f.repo.releaseFileClaims).toHaveBeenCalledWith([]);
    expect(f.semantic.embedPending).toHaveBeenCalledTimes(1);
  });

  it("classifies files it cannot read without touching storage where it can decide up front", async () => {
    const f = setup(
      [
        candidate({ id: "image", name: "photo.png", mimeType: "image/png" }),
        candidate({ id: "huge", size: RECORD_FILE_TEXT_MAX_BYTES + 1 }),
        candidate({ id: "retried", indexAttempts: RECORD_FILE_INDEX_MAX_ATTEMPTS }),
        candidate({ id: "missing", storageKey: "company/missing" }),
      ],
      {},
    );

    await f.service.indexPending();
    expect(Object.fromEntries([...f.stored].map(([id, extraction]) => [id, extraction.status]))).toEqual({
      image: "unsupported",
      huge: "skipped",
      retried: "failed",
      missing: "failed",
    });
    expect(f.read).toHaveBeenCalledTimes(1);
  });

  it("marks a broken document failed and a scanned PDF without text noText", async () => {
    const f = setup(
      [
        candidate({ id: "broken", name: "broken.pdf", mimeType: "application/pdf", storageKey: "broken" }),
        candidate({ id: "scan", name: "scan.pdf", mimeType: "application/pdf", storageKey: "scan" }),
      ],
      { broken: new TextEncoder().encode("not a pdf"), scan: pdfFixture([[]]) },
    );

    await f.service.indexPending();
    expect(f.stored.get("broken")).toEqual({ status: "failed" });
    expect(f.stored.get("scan")).toEqual({ status: "noText" });
  });

  it("reuses the extracted text of identical bytes without reading the file again", async () => {
    const f = setup(
      [candidate({ sha256: "abc", name: "copy.txt" })],
      {},
      {
        status: "done",
        text: "Shared text",
        truncated: true,
      },
    );

    await f.service.indexPending();
    expect(f.repo.findExtractionBySha256).toHaveBeenCalledWith("abc", "file-1");
    expect(f.read).not.toHaveBeenCalled();
    expect(f.stored.get("file-1")).toMatchObject({
      status: "done",
      text: "Shared text",
      truncated: true,
      chunks: [{ text: "copy.txt\n\nShared text" }],
    });
  });

  it("reports more work when the batch was full and releases claims of files it did not reach", async () => {
    const files = Array.from({ length: RECORD_FILE_INDEX_BATCH_FILES }, (_, index) =>
      candidate({ id: `file-${index}`, storageKey: `key-${index}` }),
    );
    const contents = Object.fromEntries(files.map((file) => [file.storageKey, new TextEncoder().encode("text")]));
    const full = setup(files, contents);
    await expect(full.service.indexPending()).resolves.toMatchObject({ remaining: true });

    const slow = setup(files, contents);
    const service = new RecordFileIndexService(slow.repo, () => storage(contents).driver, slow.semantic, -1);
    await expect(service.indexPending()).resolves.toEqual({ extracted: 0, embedded: 0, remaining: true });
    expect(slow.repo.releaseFileClaims).toHaveBeenCalledWith(files.map((file) => file.id));
    expect(slow.repo.startFileAttempt).not.toHaveBeenCalled();
    expect(slow.semantic.embedPending).not.toHaveBeenCalled();
  });

  it("counts an attempt only for the file it works on and keeps going when storage fails", async () => {
    const files = [
      candidate({ id: "unreadable", storageKey: "broken" }),
      candidate({ id: "readable", storageKey: "fine" }),
    ];
    const f = setup(files, {});
    const read = vi.fn((key: string) =>
      key === "broken"
        ? Promise.reject(new Error("connection reset"))
        : storage({ fine: new TextEncoder().encode("Renewal terms") }).driver.read(key),
    );
    const service = new RecordFileIndexService(f.repo, () => ({ read }) as unknown as FileStorageDriver, f.semantic);

    await expect(service.indexPending()).resolves.toMatchObject({ extracted: 1, remaining: true });
    expect(f.stored.get("readable")).toMatchObject({ status: "done", text: "Renewal terms" });
    expect(f.stored.has("unreadable")).toBe(false);
    expect(Object.fromEntries(f.attempts)).toEqual({ unreadable: 1, readable: 1 });
    expect(f.repo.releaseFileClaims).toHaveBeenCalledWith([]);
  });

  it("retries a file after a passing error and marks it failed when its last attempt fails too", async () => {
    const f = setup([candidate({ indexAttempts: RECORD_FILE_INDEX_MAX_ATTEMPTS - 1 })], {});
    const failing = new RecordFileIndexService(
      f.repo,
      () => ({ read: () => Promise.reject(new Error("connection reset")) }) as unknown as FileStorageDriver,
      f.semantic,
    );

    await expect(failing.indexPending()).resolves.toMatchObject({ extracted: 1 });
    expect(f.stored.get("file-1")).toEqual({ status: "failed" });
    expect(f.attempts.get("file-1")).toBe(RECORD_FILE_INDEX_MAX_ATTEMPTS);
  });

  it("leaves a file alone that was indexed or removed after it was claimed", async () => {
    const f = setup([candidate()], { "company/file-1": new TextEncoder().encode("text") });
    f.repo.startFileAttempt.mockResolvedValueOnce(null);

    await f.service.indexPending();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.repo.storeExtraction).not.toHaveBeenCalled();
    expect(f.repo.releaseFileClaims).toHaveBeenCalledWith([]);
  });
});
