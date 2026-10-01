import type { DocsCorpus } from "@/features/mcp-tools/docs-corpus";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { DocsPendingChunk } from "@/features/mcp-tools/prisma-docs-chunk.repository";

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  available: true,
  embedded: [] as string[][],
}));

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../wiki-embedding.service", () => ({
  isWikiSemanticSearchAvailable: () => state.available,
}));
vi.mock("../wiki-embedding-model", () => ({
  WIKI_EMBEDDING_MODEL: "google/gemini-embedding-001",
  WIKI_EMBEDDING_BATCH_SIZE: 2,
  wikiEmbeddingWorstCaseMicrocents: (texts: string[]) => texts.reduce((total, text) => total + text.length, 0) * 15,
  wikiEmbeddingAttemptCharge: (texts: string[]) => ({
    model: "google/gemini-embedding-001",
    inputTokens: texts.reduce((total, text) => total + text.length, 0),
    costMicrocents: texts.reduce((total, text) => total + text.length, 0) * 15,
    costSource: "estimated",
  }),
  embedWikiTexts: vi.fn((texts: string[]) => {
    state.embedded.push(texts);
    return Promise.resolve({
      vectors: texts.map(() => [0.5, 0.25]),
      charge: { costMicrocents: 10 },
    });
  }),
}));

import { docsCorpus } from "@/features/mcp-tools/docs-corpus";

import { DocsSemanticIndexDispatcher } from "@/ee/wiki-retrieval/docs-semantic-index-dispatcher";
import { DocsSemanticIndexService } from "../docs-semantic-index.service";

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
const usage = (admits: boolean) => ({
  admitsPlatformRetrieval: vi.fn(() => Promise.resolve(admits)),
  reservePlatformRetrieval: vi.fn(() => Promise.resolve(admits ? "platform-hold" : null)),
  settlePlatformRetrieval: vi.fn((args: unknown) => {
    accrued.push(args);
    return Promise.resolve();
  }),
});

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

    const result = await new DocsSemanticIndexService(
      chunks,
      usage(true) as unknown as AgentUsageService,
    ).indexPending();

    expect(chunks.ensureCorpus).toHaveBeenCalledWith(docsCorpus());
    expect(result).toEqual({ indexed: 3, remaining: false });
    expect(state.embedded).toEqual([["Webhooks > Signature\n\nHMAC", "Webhooks"], ["API keys\n\nx-api-key"]]);
    expect(chunks.storeEmbeddings).toHaveBeenCalledWith("google/gemini-embedding-001", [
      { contentHash: "a", embedding: "[0.5,0.25]" },
      { contentHash: "b", embedding: "[0.5,0.25]" },
    ]);
    expect(accrued).toEqual([
      { reservationId: "platform-hold", charge: { costMicrocents: 10 } },
      { reservationId: "platform-hold", charge: { costMicrocents: 10 } },
    ]);
  });

  it("stores the corpus for full-text search but embeds nothing self-hosted, without the vector column, or while hosted AI spend is paused", async () => {
    const chunks = repo([{ contentHash: "a", label: "A", body: "a" }]);
    state.available = false;
    expect(
      await new DocsSemanticIndexService(chunks, usage(true) as unknown as AgentUsageService).indexPending(),
    ).toEqual({
      indexed: 0,
      remaining: false,
    });
    state.available = true;
    expect(
      await new DocsSemanticIndexService(chunks, usage(false) as unknown as AgentUsageService).indexPending(),
    ).toEqual({
      indexed: 0,
      remaining: false,
    });
    chunks.semanticIndexAvailable.mockResolvedValueOnce(false);
    expect(
      await new DocsSemanticIndexService(chunks, usage(true) as unknown as AgentUsageService).indexPending(),
    ).toEqual({
      indexed: 0,
      remaining: false,
    });
    expect(state.embedded).toEqual([]);
    expect(accrued).toEqual([]);
    expect(chunks.ensureCorpus).toHaveBeenCalledTimes(3);
  });

  it("reserves every batch before provider work and stops when the next reservation is refused", async () => {
    const chunks = repo(
      Array.from({ length: 5 }, (_, i) => ({
        contentHash: String(i),
        label: "A",
        body: "body",
      })),
    );
    const budget = usage(true);
    vi.mocked(budget.reservePlatformRetrieval).mockResolvedValueOnce("first").mockResolvedValueOnce(null);
    expect(await new DocsSemanticIndexService(chunks, budget as unknown as AgentUsageService).indexPending()).toEqual({
      indexed: 2,
      remaining: false,
    });
    expect(state.embedded).toHaveLength(1);
    expect(budget.reservePlatformRetrieval).toHaveBeenCalledTimes(2);
    expect(budget.reservePlatformRetrieval).toHaveBeenCalledWith({
      purpose: "docsIndexing",
      model: "google/gemini-embedding-001",
      worstCaseMicrocents: 210,
    });
  });

  it("settles an ambiguous provider failure as platform cost before retrying, and settles before storing vectors", async () => {
    const { embedWikiTexts } = await import("../wiki-embedding-model");
    const chunks = repo([{ contentHash: "a", label: "A", body: "a" }]);
    const budget = usage(true);
    vi.mocked(embedWikiTexts).mockRejectedValueOnce(new Error("provider timeout"));
    await expect(
      new DocsSemanticIndexService(chunks, budget as unknown as AgentUsageService).indexPending(),
    ).rejects.toThrow("provider timeout");
    expect(budget.settlePlatformRetrieval).toHaveBeenCalledExactlyOnceWith({
      reservationId: "platform-hold",
      charge: { model: "google/gemini-embedding-001", inputTokens: 4, costMicrocents: 60, costSource: "estimated" },
    });
    expect(chunks.storeEmbeddings).not.toHaveBeenCalled();
    chunks.storeEmbeddings.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      new DocsSemanticIndexService(chunks, budget as unknown as AgentUsageService).indexPending(),
    ).rejects.toThrow("storage unavailable");
    expect(budget.settlePlatformRetrieval).toHaveBeenCalledTimes(2);
    expect(vi.mocked(embedWikiTexts).mock.calls.at(-1)?.[2]).toEqual({
      maxRetries: 0,
      onCharge: expect.any(Function),
    });
  });

  it("keeps the measured charge when a provider receipt arrives with unusable vectors", async () => {
    const { embedWikiTexts } = await import("../wiki-embedding-model");
    const chunks = repo([{ contentHash: "a", label: "A", body: "a" }]);
    const budget = usage(true);
    const charge = {
      model: "google/gemini-embedding-001",
      inputTokens: 1,
      costMicrocents: 15,
      costSource: "measured" as const,
    };
    vi.mocked(embedWikiTexts).mockImplementationOnce((_texts, _kind, options) => {
      options?.onCharge?.(charge);
      return Promise.reject(new Error("invalid vectors"));
    });
    await expect(
      new DocsSemanticIndexService(chunks, budget as unknown as AgentUsageService).indexPending(),
    ).rejects.toThrow("invalid vectors");
    expect(budget.settlePlatformRetrieval).toHaveBeenCalledExactlyOnceWith({ reservationId: "platform-hold", charge });
    expect(chunks.storeEmbeddings).not.toHaveBeenCalled();
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
