import type { DocsScope } from "../prisma-docs-chunk.repository";
import type { ContentLocale } from "@/i18n/locale-registry";
import type { RankableSection, RetrievalTiming } from "@/core/retrieval/retrieval-context";
import type { QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { DocsRetrievalEvalItem } from "@/scripts/agent-benchmark/retrieval-eval-cases";

import { writeFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fullTextUnits } from "@/core/retrieval/full-text-query";
import { docsEmbeddingText } from "../docs-embedding-input";
import { collectRetrievalTimings } from "@/core/retrieval/retrieval-context";
import { fold } from "@/core/utils/search-text";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { DOCS_LIVE_CASE_LABELS, DOCS_RETRIEVAL_EVAL } from "@/scripts/agent-benchmark/retrieval-eval-cases";
import { DOCS_HELDOUT } from "@/scripts/agent-benchmark/heldout-data/docs";
import { DOCS_EMBEDDING_HELDOUT } from "@/scripts/agent-benchmark/heldout-data/docs-embedding";

import { docsCorpus } from "../docs-corpus";
import { unifiedDocsSearch, type UnifiedDocsDeps } from "../docs-unified-search";
import { unifiedDocsPageResult } from "../docs.mcp-tools";
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
  return {
    p50: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? null,
  };
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
    const fullText = await unifiedRun({
      repo,
      embed: null,
      ranker: undefined,
    });

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

  it("has no golden question left waiting for a docs rewrite", () => {
    const pending = GOLDEN_QUESTIONS.filter((question) => question.requiresDocsRewrite).map(
      (question) => question.query,
    );
    expect(pending).toEqual([]);
  });

  async function goldenSectionOutcome(question: (typeof GOLDEN_QUESTIONS)[number]) {
    const { pages } = await unifiedDocsSearch(
      { query: question.query, locale: question.locale, source: "docs" },
      { repo, embed: null, ranker: undefined },
    );
    const best = pages[0]?.section;
    const heading = best ? best.headingPath.join(" > ") : "";
    const slugOk =
      best !== undefined && (best.slug === question.slug || (question.alternatives ?? []).includes(best.slug));
    const headings = question.heading === undefined ? [] : [question.heading].flat();
    const headingOk =
      headings.length === 0 ||
      best?.slug !== question.slug ||
      headings.some((expected) => heading.toLocaleLowerCase().includes(expected.toLocaleLowerCase()));
    return {
      locale: question.locale,
      ok: slugOk && headingOk,
      detail: `${question.locale} "${question.query}" -> ${best ? `${best.slug} > ${heading}` : "nothing"} (expected ${question.slug}${question.heading ? ` > *${[question.heading].flat().join("|")}*` : ""})`,
    };
  }

  const ANSWERABLE = GOLDEN_QUESTIONS.filter((question) => !question.requiresDocsRewrite);

  it("returns the right page and section for every probe question from the audit, full text only", async () => {
    const misses = (await Promise.all(ANSWERABLE.slice(0, GOLDEN_PROBE_COUNT).map(goldenSectionOutcome)))
      .filter((result) => !result.ok)
      .map((result) => result.detail);
    expect(misses, misses.join("\n")).toEqual([]);
  }, 120_000);

  it("answers the golden questions with the right page and section at top 1, full text only", async () => {
    const outcomes = await Promise.all(ANSWERABLE.map(goldenSectionOutcome));
    const measured: Record<string, number> = {};
    for (const [locale, floor] of Object.entries(GOLDEN_SECTION_FLOOR)) {
      const scoped = outcomes.filter((result) => result.locale === locale);
      const accuracy = round(scoped.filter((result) => result.ok).length / scoped.length);
      measured[locale] = accuracy;
      expect(scoped.length).toBeGreaterThanOrEqual(locale === "en" ? 60 : 30);
      const misses = scoped.filter((result) => !result.ok).map((result) => result.detail);
      expect(accuracy, `${locale} page+section top-1 ${accuracy}\n${misses.join("\n")}`).toBeGreaterThanOrEqual(floor);
    }
    report.goldenSection = measured;
  }, 120_000);

  const fullTextOnly = () => ({ repo, embed: null, ranker: undefined });
  const bestSection = async (query: string, locale: ContentLocale) => {
    const { pages } = await unifiedDocsSearch({ query, locale, source: "docs" }, fullTextOnly());
    return pages[0] ? [pages[0].section.slug, pages[0].section.anchor] : [];
  };
  const excerptOf = async (slug: string, query: string, locale: ContentLocale) =>
    ((await unifiedDocsPageResult({ slug, query, locale, source: "docs" }, fullTextOnly())) as { text: string }).text;

  it.each([
    ["en", "how long do quick connection keys last", "api-keys", "do-keys-expire", "365"],
    ["en", "how long is a quick connection API key valid", "api-keys", "do-keys-expire", "365"],
    ["en", "how long does an API key last", "api-keys", "do-keys-expire", "365"],
    ["de", "Wie lange gilt ein Schnellverbindungs-Schlüssel?", "api-keys", "do-keys-expire", "365"],
    ["de", "Wie lange ist ein API-Key gültig", "api-keys", "do-keys-expire", "365"],
    ["en", "how long can an API key name be", "api-keys", "what-is-the-key-format", "255"],
    ["de", "Wie lang darf der Name eines API-Keys sein", "api-keys", "what-is-the-key-format", "255"],
    ["de", "Wie lange ist der Einladungslink gültig?", "app-company", "how-do-invitations-work", "7 Tage"],
  ] as const)(
    "answers the %s key or invitation question %j with its section and fact, full text only",
    async (locale, query, slug, anchor, fact) => {
      expect(await bestSection(query, locale)).toEqual([slug, anchor]);
      expect(await excerptOf(slug, query, locale)).toContain(fact);
    },
    120_000,
  );

  it.each([
    ["en", "how do I connect a channel", "app-profile#how-do-i-connect-a-channel"],
    ["en", "connect whatsapp", "app-profile#how-do-i-connect-a-channel"],
    ["en", "connected accounts", "app-company#what-happens-to-connected-accounts-when-the-plan-changes"],
    ["en", "how long is the OAuth token valid", "connect-custom-connector#it-syncs-and-stays-connected"],
    ["en", "how long is the refresh token valid", "connect-custom-connector#it-syncs-and-stays-connected"],
  ] as const)(
    "keeps the %s question %j on its own section, full text only",
    async (locale, query, expected) => {
      expect((await bestSection(query, locale)).join("#")).toBe(expected);
    },
    120_000,
  );

  it("reports how much of the query's weight each full-text section covers", async () => {
    const scope: DocsScope = {
      buildHash: corpus.buildHash,
      locale: "en",
      sources: ["docs"],
    };
    const [full] = await repo.fullTextSections(scope, fullTextUnits("webhook signature"), 5);
    const [partial] = await repo.fullTextSections(scope, fullTextUnits("webhook signature xylophonequartet"), 5);

    expect(full.coverage).toBeCloseTo(1, 6);
    expect(partial.coverage).toBeGreaterThan(0);
    expect(partial.coverage).toBeLessThan(0.9);
  });

  it("fuses a semantic candidate list from stored embeddings when a query embedder is available", async () => {
    const pending = new Map(corpus.chunks.map((chunk) => [chunk.contentHash, docsEmbeddingText(chunk)]));
    const rows = [...pending.entries()].map(([contentHash, text]) => ({
      contentHash,
      embedding: `[${hashedBagOfWords(text).join(",")}]`,
    }));
    for (let start = 0; start < rows.length; start += 500)
      await repo.storeEmbeddings(FAKE_MODEL, rows.slice(start, start + 500));
    const scope: DocsScope = {
      buildHash: corpus.buildHash,
      locale: "en",
      sources: ["docs"],
    };
    expect(await repo.semanticIndexComplete(scope, FAKE_MODEL)).toBe(true);
    expect(await repo.semanticIndexComplete(scope, "a-model-without-embeddings")).toBe(false);

    const embedded: string[] = [];
    const embed = (query: string): Promise<QueryVector> => {
      embedded.push(query);
      return Promise.resolve({
        vector: hashedBagOfWords(query),
        model: FAKE_MODEL,
      });
    };
    const hybrid = await unifiedRun({
      repo,
      embed,
      ranker: undefined,
      relevanceFloor: null,
    });

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
const GOLDEN_PROBE_COUNT = 16;
const GOLDEN_SECTION_FLOOR = { en: 0.9, de: 0.85 };
const GOLDEN_FULL_TEXT_FLOOR = {
  en: { top1: 0.95, top5: 0.98 },
  de: { top1: 0.9, top5: 0.97 },
};
