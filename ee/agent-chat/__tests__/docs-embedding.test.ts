import type { DocsRankCandidate } from "@/features/mcp-tools/docs.mcp-tools";

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  AGENT_DOCS_RERANK: "jev" as "off" | "jev",
  AGENT_DOCS_CANDIDATES: "hybrid" as "keyword" | "hybrid",
  AGENT_DOCS_EMBEDDING_MODEL: "google-multilingual" as "qwen3-8b" | "google-multilingual",
  AI_GATEWAY_API_KEY: "key" as string | undefined,
  BASE_URL: "http://localhost:4000",
}));

const embedMany = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: envState }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), embedMany }));

import { buildAgentTurnClassifierTrace } from "../agent-classifier-trace";
import { estimateEmbeddingCostMicrocents } from "../classifier/embedding-runner";
import { collectClassifierCharges, embedQueryMetered, hostedDocsEmbeddingModel } from "../classifier/metered";
import {
  DOCS_EMBEDDING_TIMEOUT_MS,
  buildDocsEmbeddingIndex,
  docsEmbeddingBatches,
  docsEmbeddingKey,
  docsEmbeddingQueryText,
  docsEmbeddingSearch,
  docsEmbeddingSectionText,
  hostedDocsEmbeddingSearch,
  rankSectionsByEmbedding,
  searchDocsTraced,
  warmDocsEmbeddingIndex,
} from "../docs-embedding";

import {
  DOCS_RERANK_CANDIDATES,
  docsEmbeddingSections,
  docsRankCandidates,
  hybridDocsRankCandidates,
  hybridSectionIds,
  searchDocsRanked,
} from "@/features/mcp-tools/docs.mcp-tools";

const QUERY = "how do I check that a webhook call really came from you";
const INPUT = { query: QUERY, locale: "en" as const, source: "docs" as const };
const cacheDir = mkdtempSync(join(tmpdir(), "docs-embedding-"));

function gatewayMetadata(provider: string, cost: string) {
  return {
    gateway: {
      routing: {
        finalProvider: provider,
        modelAttempts: [{ success: true, providerAttempts: [{ provider, credentialType: "system", success: true }] }],
      },
      cost,
    },
  };
}

function vectorOf(text: string) {
  const id = Number(/section-(\d+)/.exec(text)?.[1] ?? -1);
  return id >= 0 ? [Math.cos(id), Math.sin(id), 0.1] : [1, 0, 0];
}

function answerEmbeddings(provider = "deepinfra", cost = "0.00000008") {
  embedMany.mockImplementation(({ values }: { values: string[] }) =>
    Promise.resolve({
      values,
      embeddings: values.map(vectorOf),
      usage: { tokens: values.length },
      providerMetadata: gatewayMetadata(provider, cost),
    }),
  );
}

function pickFirst() {
  return vi.fn((_query: string, candidates: readonly DocsRankCandidate[]) => Promise.resolve([candidates[0].id]));
}

beforeEach(() => {
  envState.APP_MODE = "cloud";
  envState.AGENT_DOCS_RERANK = "jev";
  envState.AGENT_DOCS_CANDIDATES = "hybrid";
  envState.AI_GATEWAY_API_KEY = "key";
  embedMany.mockReset();
  answerEmbeddings();
  vi.spyOn(process, "cwd").mockReturnValue(cacheDir);
});

afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));

describe("hosted docs embedding switch", () => {
  it("embeds only for hybrid candidates on a hosted instance with the re-rank on", () => {
    expect(hostedDocsEmbeddingModel()).toBe("google-multilingual");
    envState.AGENT_DOCS_CANDIDATES = "keyword";
    expect(hostedDocsEmbeddingModel()).toBeNull();
    expect(hostedDocsEmbeddingSearch()).toBeUndefined();
    envState.AGENT_DOCS_CANDIDATES = "hybrid";
    envState.AGENT_DOCS_RERANK = "off";
    expect(hostedDocsEmbeddingModel()).toBeNull();
    envState.AGENT_DOCS_RERANK = "jev";
    envState.APP_MODE = "self-hosted";
    expect(hostedDocsEmbeddingModel()).toBeNull();
  });
});

describe("metered query embedding", () => {
  it("charges the measured gateway cost to the turn and pins the serving provider with zero retention", async () => {
    const { value, charges } = await collectClassifierCharges(() => embedQueryMetered("qwen3-8b", "hello", 500));

    const expected = { use: "docs_embedding", model: "qwen3-8b", costMicrocents: 8, measured: true, answered: true };
    expect(value.embedding).toEqual([1, 0, 0]);
    expect(charges).toEqual([expected]);
    expect(embedMany.mock.calls[0][0]).toMatchObject({
      model: "alibaba/qwen3-embedding-8b",
      values: ["hello"],
      maxRetries: 0,
      providerOptions: { gateway: { only: ["deepinfra"], zeroDataRetention: true, disallowPromptTraining: true } },
    });
    expect(embedMany.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("charges a price-list estimate when the call fails or times out, and nothing without a key", async () => {
    embedMany.mockRejectedValueOnce(new Error("timeout"));
    const failed = await collectClassifierCharges(() => embedQueryMetered("google-multilingual", "hallo welt", 500));

    expect(failed.value.embedding).toBeNull();
    expect(failed.charges).toEqual([
      {
        use: "docs_embedding",
        model: "google-multilingual",
        costMicrocents: estimateEmbeddingCostMicrocents("google-multilingual", ["hallo welt"]),
        measured: false,
        answered: false,
      },
    ]);
    expect(estimateEmbeddingCostMicrocents("google-multilingual", ["hallo welt"])).toBe(10);

    envState.AI_GATEWAY_API_KEY = undefined;
    const keyless = await collectClassifierCharges(() => embedQueryMetered("qwen3-8b", "hello", 500));
    expect(keyless).toEqual({ value: { embedding: null, charge: null }, charges: [] });
  });

  it("reports query embeddings in the turn trace beside the re-rank", () => {
    const trace = buildAgentTurnClassifierTrace([
      { use: "docs_embedding", model: "qwen3-8b", costMicrocents: 8, measured: true, answered: true },
      { use: "docs_rerank", model: "jev", costMicrocents: 1_600, measured: true, answered: true },
    ]);

    expect(trace).toEqual({
      auxiliaryCostMicrocents: 1_608,
      auxiliaryMeasured: true,
      docsRerank: { model: "jev", calls: 1, answered: 1, costMicrocents: 1_600, measured: true },
      docsEmbedding: { model: "qwen3-8b", calls: 1, answered: 1, costMicrocents: 8, measured: true },
    });
  });
});

describe("hosted docs search trace", () => {
  it("waits up to 1,200 ms for the query embedding", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await warmDocsEmbeddingIndex("google-multilingual", "en");

    await docsEmbeddingSearch("google-multilingual")(QUERY, "en");

    expect(DOCS_EMBEDDING_TIMEOUT_MS).toBe(1_200);
    expect(timeout).toHaveBeenCalledWith(1_200);
    timeout.mockRestore();
  });

  it("records each docs search's wall time and whether the hybrid candidates were used", async () => {
    const sections = docsEmbeddingSections("en");
    const far = sections.findIndex((section) => section.slug === "self-hosting");
    let clock = 0;
    const now = () => (clock += 400);

    const { charges } = await collectClassifierCharges(async () => {
      await searchDocsTraced(INPUT, pickFirst(), () => Promise.resolve([far]), now);
      await searchDocsTraced(INPUT, pickFirst(), () => Promise.resolve(null), now);
      await searchDocsTraced(INPUT, pickFirst(), () => Promise.reject(new Error("down")), now);
      await searchDocsTraced(INPUT, pickFirst(), undefined, now);
      await searchDocsTraced({ ...INPUT, source: "api" }, pickFirst(), () => Promise.resolve([far]), now);
    });
    const searches = charges.filter((charge) => charge.use === "docs_search");

    expect(searches.map((charge) => [charge.latencyMs, charge.hybrid, charge.costMicrocents])).toEqual([
      [400, true, 0],
      [400, false, 0],
      [400, false, 0],
      [400, false, 0],
    ]);
    expect(buildAgentTurnClassifierTrace(charges)?.docsSearch).toEqual({
      calls: 4,
      hybrid: 1,
      latencyMs: [400, 400, 400, 400],
    });
    expect(buildAgentTurnClassifierTrace(charges)?.auxiliaryCostMicrocents).toBe(0);
  });
});

describe("docs section embedding index", () => {
  it("embeds each section once, keyed by model and text, and reuses the cache file", async () => {
    const path = join(cacheDir, "index.json");
    embedMany.mockImplementation(({ values }: { values: string[] }) =>
      Promise.resolve({ values, embeddings: values.map((_, index) => [index + 1, 1, 0]), usage: { tokens: 1 } }),
    );
    const sections = docsEmbeddingSections("en");

    const first = await buildDocsEmbeddingIndex("qwen3-8b", "en", path);
    const calls = embedMany.mock.calls.length;
    const second = await buildDocsEmbeddingIndex("qwen3-8b", "en", path);

    expect(first).toHaveLength(sections.length);
    expect(calls).toBeGreaterThan(0);
    expect(embedMany.mock.calls).toHaveLength(calls);
    expect(second).toEqual(first);
    const cached = JSON.parse(readFileSync(path, "utf8")) as { model: string; vectors: Record<string, string> };
    expect(cached.model).toBe("alibaba/qwen3-embedding-8b");
    expect(cached.vectors[docsEmbeddingKey("qwen3-8b", docsEmbeddingSectionText(sections[0]))]).toBeTruthy();
    expect(Math.hypot(...first[0])).toBeCloseTo(1, 5);
  });

  it("cuts section text at 2,000 characters behind its page and heading path and prefixes Qwen queries", () => {
    const section = docsEmbeddingSections("en").find((entry) => entry.headingPath.length > 0);
    if (!section) throw new Error("expected a section with a heading");

    expect(docsEmbeddingSectionText(section).startsWith(`${section.pageTitle} > ${section.headingPath[0]}`)).toBe(true);
    expect(docsEmbeddingSectionText({ ...section, text: "x".repeat(5_000) }).length).toBe(2_000);
    expect(docsEmbeddingQueryText("qwen3-8b", "q")).toMatch(/^Instruct: .*\nQuery: q$/s);
    expect(docsEmbeddingQueryText("google-multilingual", "q")).toBe("q");
  });

  it("splits the index requests at 64 sections or 30,000 characters, whichever comes first", () => {
    const entry = (index: number, chars: number) => [`k${index}`, "x".repeat(chars)] as const;
    const small = Array.from({ length: 130 }, (_, index) => entry(index, 10));
    const large = Array.from({ length: 40 }, (_, index) => entry(index, 2_000));

    expect(docsEmbeddingBatches(small).map((batch) => batch.length)).toEqual([64, 64, 2]);
    expect(docsEmbeddingBatches(large).map((batch) => batch.length)).toEqual([15, 15, 10]);
    expect(docsEmbeddingBatches([])).toEqual([]);
  });

  it("ranks sections by cosine similarity and skips vectors of another size", () => {
    const vectors = [
      Float32Array.from([1, 0]),
      Float32Array.from([0, 1]),
      Float32Array.from([0.8, 0.6]),
      Float32Array.from([1, 0, 0]),
    ];

    expect(rankSectionsByEmbedding(vectors, [0, 2])).toEqual([1, 2, 0]);
    expect(rankSectionsByEmbedding(vectors, [3, 0], 2)).toEqual([0, 2]);
  });

  it("returns nothing until the locale index is ready, then the ranked section ids", async () => {
    answerEmbeddings();
    const search = docsEmbeddingSearch("google-multilingual");

    expect(await search(QUERY, "de")).toBeNull();
    expect(await warmDocsEmbeddingIndex("google-multilingual", "de")).toBe(true);
    const ids = await search(QUERY, "de");

    expect(ids?.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids?.length);
  });
});

describe("hybrid docs candidates", () => {
  it("takes keyword top 10, then embedding top 10, then fills to 20 alternately without duplicates", () => {
    const keyword = Array.from({ length: 20 }, (_, index) => index);
    const embedding = [0, 1, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

    expect(hybridSectionIds(keyword, embedding)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => index),
      100,
      101,
      102,
      103,
      104,
      105,
      106,
      107,
      10,
      108,
    ]);
    expect(hybridSectionIds(keyword, [])).toEqual(keyword.slice(0, DOCS_RERANK_CANDIDATES));
    expect(hybridSectionIds([], [5, 6])).toEqual([5, 6]);
  });

  it("adds embedding candidates to the keyword ones and keeps the title-only sections of the top keyword pages", () => {
    const sections = docsEmbeddingSections("en");
    const far = sections.findIndex((section) => section.slug === "self-hosting");
    const hybrid = hybridDocsRankCandidates(QUERY, "en", [far, -1, sections.length]);
    const keyword = docsRankCandidates(QUERY, "en");

    expect(hybrid.filter((candidate) => !candidate.titleOnly).map((candidate) => candidate.id)).toContain(far);
    expect(hybrid.filter((candidate) => candidate.titleOnly).length).toBeGreaterThan(0);
    expect(hybridDocsRankCandidates(QUERY, "en", [])).toEqual(keyword);
  });

  it("re-ranks the hybrid candidates when the embedding search answers, and the keyword ones otherwise", async () => {
    const sections = docsEmbeddingSections("en");
    const far = sections.findIndex((section) => section.slug === "self-hosting");
    const rank = pickFirst();

    await searchDocsRanked(INPUT, rank, () => Promise.resolve([far]));
    expect(rank.mock.calls[0][1]).toEqual(hybridDocsRankCandidates(QUERY, "en", [far]));

    await searchDocsRanked(INPUT, rank, () => Promise.resolve(null));
    await searchDocsRanked(INPUT, rank, () => Promise.reject(new Error("down")));
    await searchDocsRanked(INPUT, rank);
    for (const call of rank.mock.calls.slice(1)) expect(call[1]).toEqual(docsRankCandidates(QUERY, "en"));
  });

  it("finds a section for a query with no keyword hit through the embedding candidates alone", async () => {
    const sections = docsEmbeddingSections("en");
    const far = sections.findIndex((section) => section.slug === "self-hosting");
    const rank = pickFirst();
    const input = { ...INPUT, query: "zzqx wvvy" };

    const without = await searchDocsRanked(input, rank);
    const withEmbedding = await searchDocsRanked(input, rank, () => Promise.resolve([far, far + 1]));

    expect(without.structuredContent.results).toEqual([]);
    expect(withEmbedding.structuredContent.results[0]).toMatchObject({ slug: "self-hosting" });
  });

  it("embeds the query for docs searches only, never for api or all", async () => {
    const embed = vi.fn(() => Promise.resolve(null));

    await searchDocsRanked({ ...INPUT, source: "api" }, pickFirst(), embed);
    await searchDocsRanked({ ...INPUT, source: "all" }, pickFirst(), embed);
    expect(embed).not.toHaveBeenCalled();
    await searchDocsRanked(INPUT, pickFirst(), embed);
    expect(embed).toHaveBeenCalledWith(QUERY, "en");
  });
});
