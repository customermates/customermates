import type { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import type { RecordFileSemanticIndexRepo, UnembeddedRecordFileChunk } from "../record-file-semantic-index.repo";

import { describe, expect, it, vi } from "vitest";

import { WIKI_EMBEDDING_BATCH_SIZE, WIKI_EMBEDDING_MODEL } from "@/ee/wiki-retrieval/wiki-embedding-model";

import {
  RECORD_FILE_SEMANTIC_BATCH_FILES,
  RECORD_FILE_SEMANTIC_BATCHES_PER_STEP,
  RecordFileSemanticIndexService,
} from "../record-file-semantic-index.service";

const GRANT = { purpose: "fileIndexing", companyId: "company-1", userId: null };

function chunks(fileId: string, count: number, hash = (index: number) => `${fileId}-${index}`) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${fileId}-chunk-${index}`,
    contentHash: hash(index),
    text: `text ${hash(index)}`,
  }));
}

function setup(options: {
  files: Record<string, UnembeddedRecordFileChunk[]>;
  known?: Map<string, string>;
  available?: boolean;
  authorized?: boolean;
  exhaustAfterCalls?: number;
}) {
  const stored: Array<{ id: string; embedding: string }> = [];
  const embedded = new Set<string>();
  const repo = {
    semanticIndexAvailable: vi.fn(() => Promise.resolve(options.available ?? true)),
    claimUnembeddedFiles: vi.fn(() => Promise.resolve(Object.keys(options.files))),
    unembeddedChunks: vi.fn((fileId: string, _model: string, limit: number) =>
      Promise.resolve(
        options.files[fileId].filter((chunk) => !stored.some(({ id }) => id === chunk.id)).slice(0, limit),
      ),
    ),
    embeddingsByHash: vi.fn((_model: string, hashes: string[]) =>
      Promise.resolve(
        new Map([...(options.known ?? new Map<string, string>())].filter(([hash]) => hashes.includes(hash))),
      ),
    ),
    storeChunkEmbeddings: vi.fn((_model: string, rows: Array<{ id: string; embedding: string }>) => {
      stored.push(...rows);
      return Promise.resolve();
    }),
    markFileEmbedded: vi.fn((fileId: string) => {
      const done = options.files[fileId].every((chunk) => stored.some(({ id }) => id === chunk.id));
      if (done) embedded.add(fileId);
      return Promise.resolve(done);
    }),
    releaseFileClaims: vi.fn(() => Promise.resolve()),
  } satisfies RecordFileSemanticIndexRepo;
  let calls = 0;
  const embedTexts = vi.fn((_grant: unknown, texts: string[]) => {
    calls += 1;
    if (options.exhaustAfterCalls !== undefined && calls > options.exhaustAfterCalls) return Promise.resolve(null);
    return Promise.resolve(texts.map((_, index) => [index, 1, 0]));
  });
  const authorizeIndexing = vi.fn(() => Promise.resolve(options.authorized === false ? null : GRANT));
  const embeddings = { authorizeIndexing, embedTexts } as unknown as WikiEmbeddingService;
  return {
    service: new RecordFileSemanticIndexService(repo, embeddings, "company-1"),
    repo,
    stored,
    embedded,
    embedTexts,
    authorizeIndexing,
  };
}

describe("record file semantic indexing", () => {
  it("embeds missing chunks with the Knowledge Base model, charged as workspace file indexing", async () => {
    const f = setup({ files: { a: chunks("a", 3) } });

    await expect(f.service.embedPending()).resolves.toEqual({ embedded: 1, remaining: false });
    expect(f.authorizeIndexing).toHaveBeenCalledWith("company-1", "fileIndexing");
    expect(f.embedTexts).toHaveBeenCalledWith(GRANT, ["text a-0", "text a-1", "text a-2"], "document");
    expect(f.repo.claimUnembeddedFiles).toHaveBeenCalledWith(WIKI_EMBEDDING_MODEL, RECORD_FILE_SEMANTIC_BATCH_FILES);
    expect(f.stored.map(({ id }) => id)).toEqual(["a-chunk-0", "a-chunk-1", "a-chunk-2"]);
    expect(f.stored[0].embedding).toBe("[0,1,0]");
    expect(f.repo.releaseFileClaims).toHaveBeenCalledWith(["a"]);
  });

  it("reuses stored vectors for identical chunk text and embeds each new text once", async () => {
    const f = setup({
      files: { a: chunks("a", 4, (index) => (index < 2 ? "known" : "fresh")) },
      known: new Map([["known", "[9,9,9]"]]),
    });

    await f.service.embedPending();
    expect(f.embedTexts).toHaveBeenCalledTimes(1);
    expect(f.embedTexts.mock.calls[0][1]).toEqual(["text fresh"]);
    expect(f.stored.map(({ embedding }) => embedding)).toEqual(["[9,9,9]", "[9,9,9]", "[0,1,0]", "[0,1,0]"]);
    expect(f.embedded).toEqual(new Set(["a"]));
  });

  it("does nothing without pgvector, hosted AI or credits", async () => {
    for (const options of [{ available: false }, { authorized: false }]) {
      const f = setup({ files: { a: chunks("a", 2) }, ...options });
      await expect(f.service.embedPending()).resolves.toEqual({ embedded: 0, remaining: false });
      expect(f.repo.claimUnembeddedFiles).not.toHaveBeenCalled();
      expect(f.embedTexts).not.toHaveBeenCalled();
    }
  });

  it("pauses when the workspace pool runs out and keeps what it already embedded", async () => {
    const f = setup({ files: { a: chunks("a", WIKI_EMBEDDING_BATCH_SIZE + 5) }, exhaustAfterCalls: 1 });

    await expect(f.service.embedPending()).resolves.toEqual({ embedded: 0, remaining: false });
    expect(f.stored).toHaveLength(WIKI_EMBEDDING_BATCH_SIZE);
    expect(f.embedded.size).toBe(0);
    expect(f.repo.releaseFileClaims).toHaveBeenCalledWith(["a"]);
  });

  it("stops after its per-step budget and reports the rest as remaining", async () => {
    const f = setup({
      files: {
        a: chunks("a", WIKI_EMBEDDING_BATCH_SIZE * RECORD_FILE_SEMANTIC_BATCHES_PER_STEP + 1),
        b: chunks("b", 1),
      },
    });

    await expect(f.service.embedPending()).resolves.toEqual({ embedded: 0, remaining: true });
    expect(f.embedTexts).toHaveBeenCalledTimes(RECORD_FILE_SEMANTIC_BATCHES_PER_STEP);
    expect(f.repo.unembeddedChunks).not.toHaveBeenCalledWith("b", expect.anything(), expect.anything());

    await expect(f.service.embedPending()).resolves.toEqual({ embedded: 2, remaining: false });
  });
});
