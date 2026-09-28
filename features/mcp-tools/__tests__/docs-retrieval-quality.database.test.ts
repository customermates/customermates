import type { RankableSection, RetrievalTiming } from "@/core/retrieval/retrieval-context";
import type { QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { DocsRetrievalEvalItem } from "@/scripts/agent-benchmark/retrieval-eval-cases";

import { writeFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { retrievalChunkText } from "@/core/retrieval/retrieval-chunks";
import { collectRetrievalTimings } from "@/core/retrieval/retrieval-context";
import { fold } from "@/core/utils/search-text";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { DOCS_LIVE_CASE_LABELS, DOCS_RETRIEVAL_EVAL } from "@/scripts/agent-benchmark/retrieval-eval-cases";
import { DOCS_HELDOUT } from "@/scripts/agent-benchmark/heldout-data/docs";
import { DOCS_EMBEDDING_HELDOUT } from "@/scripts/agent-benchmark/heldout-data/docs-embedding";

import { docsCorpus } from "../docs-corpus";
import { unifiedDocsSearch, type UnifiedDocsDeps } from "../docs-unified-search";
import { PrismaDocsChunkRepo } from "../prisma-docs-chunk.repository";

import { GOLDEN_QUESTIONS } from "./fixtures/docs-retrieval-golden";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const FAKE_MODEL = "test/hashed-bag-of-words";
const FAKE_DIMENSIONS = 768;

type Ranked = { slug: string; anchor: string };
type Outcome = { pageRank: number; sectionHit: boolean; candidateHit: boolean };
type Metrics = {
  items: number;
  pageRecallAt1: number;
  pageRecallAt5: number;
  pageMrr: number;
  sectionHitAt1: number;
  rerankCandidateRecall: number;
};

function hashedBagOfWords(text: string): number[] {
  const vector = new Array<number>(FAKE_DIMENSIONS).fill(0);
  for (const token of fold(text).match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 2_166_136_261;
    for (const character of token) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619);
    vector[1 + ((hash >>> 0) % (FAKE_DIMENSIONS - 1))] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  const unit = vector.map((value) => value / norm);
  unit[0] = 1;
  return unit.map((value) => value / Math.SQRT2);
}

function goldPages(item: DocsRetrievalEvalItem) {
  return new Set([item.slug, ...item.alternatives.map((target) => target.split("#")[0])]);
}

function goldSections(item: DocsRetrievalEvalItem) {
  return new Set([...item.anchors, ...item.alternatives]);
}

function outcome(item: DocsRetrievalEvalItem, ranked: readonly Ranked[], candidates: readonly Ranked[]): Outcome {
  const pages = goldPages(item);
  const sections = goldSections(item);
  const pageRank = ranked.findIndex((hit) => pages.has(hit.slug)) + 1;
  const [best] = ranked;
  return {
    pageRank,
    sectionHit: best !== undefined && sections.has(`${best.slug}#${best.anchor}`),
    candidateHit: candidates.some((hit) => sections.has(`${hit.slug}#${hit.anchor}`)),
  };
}

function latency(timings: readonly RetrievalTiming[]) {
  const sorted = timings.map((timing) => timing.totalMs).sort((left, right) => left - right);
  return { p50: sorted[Math.floor(sorted.length / 2)] ?? null, p95: sorted[Math.floor(sorted.length * 0.95)] ?? null };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function summarize(outcomes: readonly Outcome[]): Metrics {
  const share = (predicate: (entry: Outcome) => boolean) => round(outcomes.filter(predicate).length / outcomes.length);
  return {
    items: outcomes.length,
    pageRecallAt1: share((entry) => entry.pageRank === 1),
    pageRecallAt5: share((entry) => entry.pageRank >= 1 && entry.pageRank <= 5),
    pageMrr: round(
      outcomes.reduce((sum, entry) => sum + (entry.pageRank > 0 ? 1 / entry.pageRank : 0), 0) / outcomes.length,
    ),
    sectionHitAt1: share((entry) => entry.sectionHit),
    rerankCandidateRecall: share((entry) => entry.candidateHit),
  };
}

const SETS: Array<[string, readonly DocsRetrievalEvalItem[]]> = [
  ["D", DOCS_LIVE_CASE_LABELS],
  ["DH", DOCS_HELDOUT],
  ["DE", DOCS_EMBEDDING_HELDOUT],
  ["all", DOCS_RETRIEVAL_EVAL],
];

describeDatabase("documentation retrieval quality on the benchmark docs questions", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const repo = new PrismaDocsChunkRepo();
  const corpus = docsCorpus();
  const report: Record<string, unknown> = {};

  beforeAll(async () => {
    await client.connect();
    await repo.ensureCorpus(corpus);
  }, 120_000);

  afterAll(async () => {
    if (process.env.DOCS_RETRIEVAL_EVAL_REPORT)
      writeFileSync(process.env.DOCS_RETRIEVAL_EVAL_REPORT, JSON.stringify(report, null, 2));
    await client.query('UPDATE "DocsChunk" SET "embedding" = NULL, "model" = NULL WHERE "model" = $1', [FAKE_MODEL]);
    await client.end();
  });

  async function unifiedRun(deps: UnifiedDocsDeps) {
    const outcomes = new Map<string, Outcome>();
    const timings: RetrievalTiming[] = [];
    for (const item of DOCS_RETRIEVAL_EVAL) {
      let candidates: readonly RankableSection[] = [];
      const ranker = (_query: string, offered: readonly RankableSection[]) => {
        candidates = offered;
        return Promise.resolve(null);
      };
      const { value, timings: recorded } = await collectRetrievalTimings(() =>
        unifiedDocsSearch({ query: item.query, locale: item.docsLocale, source: "docs" }, { ...deps, ranker }),
      );
      timings.push(...recorded);
      outcomes.set(
        item.id,
        outcome(
          item,
          value.pages.map(({ section }) => section),
          candidates.map(({ section }) => section as unknown as Ranked),
        ),
      );
    }
    return { outcomes, timings };
  }

  function metricsBySet(outcomes: Map<string, Outcome>) {
    return Object.fromEntries(
      SETS.map(([name, items]) => [name, summarize(items.flatMap((item) => outcomes.get(item.id) ?? []))]),
    );
  }

  it("meets the unified full-text floor on the benchmark docs questions", async () => {
    const fullText = await unifiedRun({ repo, embed: null, ranker: undefined });

    const fullTextMetrics = metricsBySet(fullText.outcomes);
    report.unifiedFullText = fullTextMetrics;
    report.unifiedFullTextTotalMs = latency(fullText.timings);

    expect(DOCS_RETRIEVAL_EVAL).toHaveLength(110);
    expect(fullText.timings.every((timing) => timing.embedding === "none")).toBe(true);
    for (const [key, floor] of Object.entries(UNIFIED_FULL_TEXT_FLOOR))
      expect(fullTextMetrics.all[key as keyof Metrics], `unified full-text ${key}`).toBeGreaterThanOrEqual(floor);
  }, 120_000);

  it("answers the docs audit golden questions with the right page in the top five, full text only", async () => {
    const outcomes = await Promise.all(
      GOLDEN_QUESTIONS.map(async (question) => {
        const { pages } = await unifiedDocsSearch(
          { query: question.query, locale: question.locale, source: "docs" },
          { repo, embed: null, ranker: undefined },
        );
        const slugs = pages.map(({ section }) => section.slug);
        const expected = [question.slug, ...(question.alternatives ?? [])];
        return {
          locale: question.locale,
          top1: expected.includes(slugs[0] ?? ""),
          top5: slugs.some((slug) => expected.includes(slug)),
          detail: `${question.locale} "${question.query}" -> ${slugs.slice(0, 3).join(", ") || "nothing"} (expected ${question.slug})`,
        };
      }),
    );
    const share = (locale: string, key: "top1" | "top5") => {
      const scoped = outcomes.filter((outcome) => outcome.locale === locale);
      return round(scoped.filter((outcome) => outcome[key]).length / scoped.length);
    };
    report.golden = Object.fromEntries(
      Object.keys(GOLDEN_FULL_TEXT_FLOOR).map((locale) => [
        locale,
        { top1: share(locale, "top1"), top5: share(locale, "top5") },
      ]),
    );
    const misses = outcomes.filter((outcome) => !outcome.top5).map((outcome) => outcome.detail);
    for (const [locale, floor] of Object.entries(GOLDEN_FULL_TEXT_FLOOR)) {
      expect(share(locale, "top1"), `${locale} top-1`).toBeGreaterThanOrEqual(floor.top1);
      expect(share(locale, "top5"), `${locale} top-5; misses:\n${misses.join("\n")}`).toBeGreaterThanOrEqual(
        floor.top5,
      );
    }
  }, 120_000);

  it("fuses a semantic candidate list from stored embeddings when a query embedder is available", async () => {
    const pending = new Map(
      corpus.chunks.map((chunk) => [chunk.contentHash, retrievalChunkText(chunk.label, chunk.body)]),
    );
    const rows = [...pending.entries()].map(([contentHash, text]) => ({
      contentHash,
      embedding: `[${hashedBagOfWords(text).join(",")}]`,
    }));
    for (let start = 0; start < rows.length; start += 500)
      await repo.storeEmbeddings(FAKE_MODEL, rows.slice(start, start + 500));

    const embedded: string[] = [];
    const embed = (query: string): Promise<QueryVector> => {
      embedded.push(query);
      return Promise.resolve({ vector: hashedBagOfWords(query), model: FAKE_MODEL });
    };
    const hybrid = await unifiedRun({ repo, embed, ranker: undefined });

    const hybridMetrics = metricsBySet(hybrid.outcomes);
    report.unifiedFakeEmbedding = hybridMetrics;
    report.unifiedFakeEmbeddingTotalMs = latency(hybrid.timings);

    expect(embedded).toHaveLength(DOCS_RETRIEVAL_EVAL.length);
    expect(hybrid.timings.every((timing) => timing.embedding === "used" && timing.semanticMs !== null)).toBe(true);
    expect(hybridMetrics.all.rerankCandidateRecall).toBeGreaterThanOrEqual(
      UNIFIED_FULL_TEXT_FLOOR.rerankCandidateRecall,
    );
  }, 120_000);
});

const UNIFIED_FULL_TEXT_FLOOR = {
  pageRecallAt1: 0.4,
  pageRecallAt5: 0.72,
  sectionHitAt1: 0.23,
  rerankCandidateRecall: 0.78,
};
const GOLDEN_FULL_TEXT_FLOOR = { en: { top1: 0.95, top5: 0.98 }, de: { top1: 0.9, top5: 0.97 } };
