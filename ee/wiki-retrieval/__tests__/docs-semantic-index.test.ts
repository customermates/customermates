import type { DocsCorpus } from "@/features/mcp-tools/docs-corpus";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { DocsChunkRepo, DocsPendingChunk } from "@/features/mcp-tools/prisma-docs-chunk.repository";

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ available: true, embedded: [] as string[][] }));

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../wiki-embedding.service", () => ({ isWikiSemanticSearchAvailable: () => state.available }));
vi.mock("../wiki-embedding-model", () => ({
  WIKI_EMBEDDING_MODEL: "google/gemini-embedding-001",
  WIKI_EMBEDDING_BATCH_SIZE: 2,
  embedWikiTexts: vi.fn((texts: string[]) => {
    state.embedded.push(texts);
    return Promise.resolve({ vectors: texts.map(() => [0.5, 0.25]), charge: { costMicrocents: 10 } });
  }),
}));

import { docsCorpus } from "@/features/mcp-tools/docs-corpus";

import { DocsSemanticIndexDispatcher, DocsSemanticIndexService } from "../docs-semantic-index.service";

function repo(pending: DocsPendingChunk[]) {
  const queue = [...pending];
  return {
    ensureCorpus: vi.fn(() => Promise.resolve()),
    storedBuild: vi.fn((corpus: DocsCorpus) => Promise.resolve({ buildHash: corpus.buildHash, current: true })),
    fullTextSections: vi.fn(),
    semanticSections: vi.fn(),
    semanticIndexAvailable: vi.fn(() => Promise.resolve(true)),
    semanticIndexComplete: vi.fn(() => Promise.resolve(true)),
    pendingEmbeddings: vi.fn((_build: string, _model: string, limit: number) => Promise.resolve(queue.slice(0, limit))),
    storeEmbeddings: vi.fn((_model: string, rows: Array<{ contentHash: string }>) => {
      for (const row of rows) {
        queue.splice(
          queue.findIndex((chunk) => chunk.contentHash === row.contentHash),
          1,
        );
      }
      return Promise.resolve();
    }),
  } satisfies DocsChunkRepo;
}

const accrued: unknown[] = [];
const usage = (admits: boolean) =>
  ({
    admitsPlatformRetrieval: vi.fn(() => Promise.resolve(admits)),
    accruePlatformUsage: vi.fn((args: unknown) => {
      accrued.push(args);
      return Promise.resolve();
    }),
  }) as unknown as AgentUsageService;

beforeEach(() => {
  state.available = true;
  state.embedded = [];
  accrued.length = 0;
});

describe("documentation embedding index", () => {
  it("embeds each pending content hash once as platform cost, labelled like a Wiki chunk", async () => {
    const chunks = repo([
      { contentHash: "a", label: "Webhooks > Signature", body: "HMAC" },
      { contentHash: "b", label: "Webhooks", body: "" },
      { contentHash: "c", label: "API keys", body: "x-api-key" },
    ]);

    const result = await new DocsSemanticIndexService(chunks, usage(true)).indexPending();

    expect(chunks.ensureCorpus).toHaveBeenCalledWith(docsCorpus());
    expect(result).toEqual({ indexed: 3, remaining: false });
    expect(state.embedded).toEqual([["Webhooks > Signature\n\nHMAC", "Webhooks"], ["API keys\n\nx-api-key"]]);
    expect(chunks.storeEmbeddings).toHaveBeenCalledWith("google/gemini-embedding-001", [
      { contentHash: "a", embedding: "[0.5,0.25]" },
      { contentHash: "b", embedding: "[0.5,0.25]" },
    ]);
    expect(accrued).toEqual([
      { purpose: "docsIndexing", charge: { costMicrocents: 10 } },
      { purpose: "docsIndexing", charge: { costMicrocents: 10 } },
    ]);
  });

  it("stores the corpus for full-text search but embeds nothing self-hosted, without the vector column, or while hosted AI spend is paused", async () => {
    const chunks = repo([{ contentHash: "a", label: "A", body: "a" }]);
    state.available = false;
    expect(await new DocsSemanticIndexService(chunks, usage(true)).indexPending()).toEqual({
      indexed: 0,
      remaining: false,
    });
    state.available = true;
    expect(await new DocsSemanticIndexService(chunks, usage(false)).indexPending()).toEqual({
      indexed: 0,
      remaining: false,
    });
    chunks.semanticIndexAvailable.mockResolvedValueOnce(false);
    expect(await new DocsSemanticIndexService(chunks, usage(true)).indexPending()).toEqual({
      indexed: 0,
      remaining: false,
    });
    expect(state.embedded).toEqual([]);
    expect(accrued).toEqual([]);
    expect(chunks.ensureCorpus).toHaveBeenCalledTimes(3);
  });

  it("dispatches the indexing workflow for an unseeded build or pending chunks, at most once a minute per process", async () => {
    const dispatch = vi.fn(() => Promise.resolve());
    const tasks = { dispatch } as unknown as BackgroundTaskService;
    const pending = repo([{ contentHash: "a", label: "A", body: "a" }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    try {
      await new DocsSemanticIndexDispatcher(pending, tasks).schedule("build", true);
      await new DocsSemanticIndexDispatcher(pending, tasks).schedule("build", true);
      vi.setSystemTime(new Date("2026-10-01T10:02:00Z"));
      await new DocsSemanticIndexDispatcher(repo([]), tasks).schedule("build", true);
      vi.setSystemTime(new Date("2026-10-01T10:04:00Z"));
      state.available = false;
      await new DocsSemanticIndexDispatcher(repo([]), tasks).schedule("build", false);
    } finally {
      vi.useRealTimers();
    }
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith("index-docs-chunks", {});
  });
});
