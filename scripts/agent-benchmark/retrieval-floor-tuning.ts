import "dotenv/config";

import type { RankableSection, RetrievalCorpus, SectionRanker } from "@/core/retrieval/retrieval-context";
import type { DocsScope } from "@/features/mcp-tools/prisma-docs-chunk.repository";
import type { QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { AgentRetrievalGrant } from "@/ee/agent-chat/agent-usage.service";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Client } from "pg";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { runWithSectionRanking } from "@/core/retrieval/retrieval-context";
import { fullTextUnits } from "@/core/retrieval/full-text-query";
import { RETRIEVAL_EMBEDDING_WAIT_MS } from "@/core/retrieval/retrieval-pipeline";
import { collectClassifierCharges } from "@/ee/agent-chat/classifier/metered";
import { docsRankSpec, docsRankState, docsRankUserMessage, hostedSectionRankers } from "@/ee/agent-chat/docs-rerank";
import { estimateClassifierCostMicrocents } from "@/ee/agent-chat/classifier/metered";
import { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import { embedWikiTexts, wikiEmbeddingWorstCaseMicrocents, WIKI_EMBEDDING_MODEL } from "@/ee/wiki-retrieval/wiki-embedding-model";
import { WikiSemanticIndexService } from "@/ee/wiki-retrieval/wiki-semantic-index.service";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";
import { unifiedDocsSearch } from "@/features/mcp-tools/docs-unified-search";
import { PrismaDocsChunkRepo } from "@/features/mcp-tools/prisma-docs-chunk.repository";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { SearchWikiPagesInteractor } from "@/features/wiki/search-wiki-pages.interactor";
import { wikiMarkdownSections } from "@/features/wiki/wiki-markdown-sections";
import { WikiMarkdownSchema } from "@/features/wiki/wiki.schema";
import { createMockUser } from "@/tests/helpers/mock-user";

import { requireLocalBenchmarkDatabase } from "./env";
import { RetrievalBudget } from "./retrieval-budget";
import { DOCS_HELDOUT } from "./heldout-data/docs";
import {
  DOCS_LIVE_CASE_LABELS,
  DOCS_NO_MATCH_EVAL,
  WIKI_NO_MATCH_TUNING,
  WIKI_RETRIEVAL_CORPUS,
  WIKI_RETRIEVAL_QUERIES,
} from "./retrieval-eval-cases";

const MICROCENTS_PER_USD = 100_000_000;

type Signal = {
  corpus: RetrievalCorpus;
  id: string;
  query: string;
  noMatch: boolean;
  embeddingMs: number;
  arrived: boolean;
  pinned: number;
  coverage: number;
  similarity: number | null;
  empty: boolean;
  hit: boolean;
  jevNone: boolean | null;
};

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value.`);
  return value;
}

const capValue = flag("cap");
if (process.argv.includes("--cap") && (capValue === undefined || capValue.startsWith("--")))
  throw new Error("Floor tuning --cap requires a USD amount.");
const budget = new RetrievalBudget(capValue ?? "0.3");
const outPath = resolve(flag("out") ?? "scripts/agent-benchmark/.runs/retrieval-floor-tuning/signals.json");

function assertBudget() {
  budget.assertAvailable();
}

async function budgetedEmbedding(texts: string[], kind: "query" | "document") {
  return budget.run(
    Math.max(1, wikiEmbeddingWorstCaseMicrocents(texts)),
    () => embedWikiTexts(texts, kind, { maxRetries: 0 }),
    ({ charge }) => charge.costSource === "measured" ? charge.costMicrocents : undefined,
  );
}

async function embed(query: string): Promise<{ vector: QueryVector | null; ms: number }> {
  const started = performance.now();
  try {
    const { vectors } = await budgetedEmbedding([query.normalize("NFC").replace(/\s+/gu, " ").trim()], "query");
    return {
      vector: { vector: vectors[0], model: WIKI_EMBEDDING_MODEL },
      ms: Math.round(performance.now() - started),
    };
  } catch {
    assertBudget();
    return { vector: null, ms: Math.round(performance.now() - started) };
  }
}

function abstainingRanker(query: string, corpus: RetrievalCorpus, seen: { none: boolean | null }) {
  const ranker = hostedSectionRankers(query)?.(corpus);
  if (!ranker) throw new Error("The hosted re-rank is unavailable: set APP_MODE to cloud and AI_GATEWAY_API_KEY.");
  const wrapped: SectionRanker = async (rankQuery: string, candidates: readonly RankableSection[]) => {
    const maximum = Math.max(1, 3 * estimateClassifierCostMicrocents(docsRankSpec(candidates, corpus, rankQuery), docsRankState(rankQuery, docsRankUserMessage(query))));
    const { value } = await budget.run(
      maximum,
      () => collectClassifierCharges(() => ranker(rankQuery, candidates)),
      ({ charges }) => charges.length > 0 && charges.every((charge) => charge.measured)
        ? charges.reduce((total, charge) => total + charge.costMicrocents, 0)
        : undefined,
    );
    seen.none = value ? value.abstained : null;
    return value;
  };
  return wrapped;
}

async function docsSignals(): Promise<Signal[]> {
  const repo = new PrismaDocsChunkRepo();
  const corpus = docsCorpus();
  await repo.ensureCorpus(corpus);
  const items = [
    ...[...DOCS_LIVE_CASE_LABELS, ...DOCS_HELDOUT].map((item) => ({
      ...item,
      noMatch: false,
    })),
    ...DOCS_NO_MATCH_EVAL.map((item) => ({
      ...item,
      slug: "",
      anchors: [],
      alternatives: [],
      noMatch: true,
    })),
  ];
  const signals: Signal[] = [];
  for (const item of items) {
    const embedding = await embed(item.query);
    const arrived = embedding.vector !== null && embedding.ms <= RETRIEVAL_EMBEDDING_WAIT_MS;
    const scope: DocsScope = {
      buildHash: corpus.buildHash,
      locale: item.docsLocale,
      sources: ["docs"],
    };
    const fullText = await repo.fullTextSections(scope, fullTextUnits(item.query), 40);
    const semantic = embedding.vector
      ? await repo.semanticSections(scope, embedding.vector.vector, embedding.vector.model, 30)
      : null;
    const seen = { none: null as boolean | null };
    const result = await unifiedDocsSearch(
      { query: item.query, locale: item.docsLocale, source: "docs" },
      {
        repo,
        embed: () => Promise.resolve(arrived ? embedding.vector : null),
        ranker: abstainingRanker(item.query, "docs", seen),
        relevanceFloor: null,
      },
    );
    const sections = new Set([...item.anchors, ...item.alternatives]);
    const [best] = result.pages;
    signals.push({
      corpus: "docs",
      id: item.id,
      query: item.query,
      noMatch: item.noMatch,
      embeddingMs: embedding.ms,
      arrived,
      pinned: 0,
      coverage: Math.max(0, ...fullText.map(({ coverage }) => coverage)),
      similarity: arrived ? Math.max(0, ...(semantic ?? []).map(({ similarity }) => similarity)) : null,
      empty: result.pages.length === 0,
      hit: best !== undefined && sections.has(`${best.section.slug}#${best.section.anchor}`),
      jevNone: seen.none,
    });
    assertBudget();
  }
  return signals;
}

class TuningEmbeddingService extends WikiEmbeddingService {
  constructor() {
    super(undefined as never);
  }

  override authorizeQuery() {
    return Promise.resolve(this.grant());
  }

  override authorizeIndexing() {
    return Promise.resolve(this.grant());
  }

  override async embedTexts(_grant: AgentRetrievalGrant, texts: string[], kind: "query" | "document") {
    const { vectors } = await budgetedEmbedding(texts, kind);
    return vectors;
  }

  private grant(): AgentRetrievalGrant {
    return {
      purpose: "wikiIndexing",
      companyId: "",
      userId: null,
      planSnapshot: SubscriptionPlan.business,
      subscriptionStatusSnapshot: SubscriptionStatus.active,
      allowanceMicrocentsSnapshot: 0,
      periodStart: new Date(0),
      periodEnd: new Date(0),
    };
  }
}

async function wikiSignals(databaseUrl: string): Promise<Signal[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const companyId = randomUUID();
  const userId = randomUUID();
  const user: TenantUser = createMockUser({ id: userId, companyId });
  const markdownByTitle = new Map<string, string>();
  try {
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `wiki-tuning-${userId}@example.invalid`, "Wiki", "Tuning", companyId],
    );
    for (const [index, page] of WIKI_RETRIEVAL_CORPUS.entries()) {
      const markdown = WikiMarkdownSchema.parse(page.markdown);
      markdownByTitle.set(page.title, markdown);
      await client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
        [randomUUID(), companyId, page.title, markdown, new Date(Date.UTC(2026, 0, 1, 0, 0, index))],
      );
    }
    const indexer = new WikiSemanticIndexService(new PrismaWikiPageRepo(), new TuningEmbeddingService());
    for (let step = 0; step < 50; step += 1) {
      const result = await runWithTenant(user, () => indexer.indexStalePages());
      if (result.indexed === 0) break;
    }

    const queries = [
      ...WIKI_RETRIEVAL_QUERIES.map((labelled, index) => ({
        id: `W${index + 1}`,
        query: labelled.query,
        expect: labelled.expect,
        answer: labelled.answer,
        noMatch: labelled.expect.length === 0,
      })),
      ...WIKI_NO_MATCH_TUNING.map((item) => ({
        id: item.id,
        query: item.query,
        expect: [] as string[],
        answer: undefined,
        noMatch: true,
      })),
    ];
    const signals: Signal[] = [];
    for (const labelled of queries) {
      const embedding = await embed(labelled.query);
      const arrived = embedding.vector !== null && embedding.ms <= RETRIEVAL_EMBEDDING_WAIT_MS;
      const repo = new PrismaWikiPageRepo();
      const fullText = await runWithTenant(user, () => repo.fullTextPageCandidates(labelled.query, 30));
      const semantic =
        arrived && embedding.vector
          ? await runWithTenant(user, () =>
              repo.semanticPageCandidates(embedding.vector?.vector ?? [], WIKI_EMBEDDING_MODEL, 30),
            )
          : null;
      const seen = { none: null as boolean | null };
      const interactor = new SearchWikiPagesInteractor(new PrismaWikiPageRepo(), "stored", {
        embedder: {
          embedQuery: () => Promise.resolve(arrived ? embedding.vector : null),
        },
        scheduler: { schedule: () => Promise.resolve() },
        relevanceFloor: null,
      });
      const ranker = abstainingRanker(labelled.query, "wiki", seen);
      const result = await runWithSectionRanking(
        () => ranker,
        () => runWithTenant(user, () => interactor.invoke({ query: labelled.query, page: 1, pageSize: 5 })),
      );
      if (!result.ok) throw new Error(`Wiki search failed for ${labelled.id}`);
      const [top] = result.data.items;
      const markdown = top ? (markdownByTitle.get(top.title) ?? "") : "";
      const section = top
        ? wikiMarkdownSections(markdown).find(({ offset }) => offset === (top.offset ?? 0))
        : undefined;
      const answer = labelled.answer?.toLocaleLowerCase();
      const hit =
        top !== undefined &&
        labelled.expect.includes(top.title) &&
        (answer === undefined ||
          top.snippet.replaceAll("**", "").toLocaleLowerCase().includes(answer) ||
          (section !== undefined &&
            markdown.slice(section.offset, section.end).replaceAll("**", "").toLocaleLowerCase().includes(answer)));
      signals.push({
        corpus: "wiki",
        id: labelled.id,
        query: labelled.query,
        noMatch: labelled.noMatch,
        embeddingMs: embedding.ms,
        arrived,
        pinned: fullText.pinned.length,
        coverage: fullText.coverage,
        similarity: arrived ? Math.max(0, ...(semantic?.candidates ?? []).map(({ similarity }) => similarity)) : null,
        empty: result.data.items.length === 0,
        hit,
        jevNone: seen.none,
      });
      assertBudget();
    }
    return signals;
  } finally {
    await client.query('DELETE FROM "WikiPageChunk" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  }
}

type Rule = { coverage: number; similarity: number; jevNone: boolean };

function emptied(signal: Signal, rule: Rule): boolean {
  if (signal.empty) return true;
  if (!signal.arrived || signal.similarity === null || signal.pinned > 0) return false;
  if (signal.coverage >= rule.coverage) return false;
  if (signal.similarity < rule.similarity) return true;
  return rule.jevNone && signal.jevNone === true;
}

function evaluate(signals: readonly Signal[], rule: Rule) {
  const positives = signals.filter((signal) => !signal.noMatch);
  const negatives = signals.filter((signal) => signal.noMatch);
  const hits = positives.filter((signal) => signal.hit && !emptied(signal, rule)).length;
  const baseline = positives.filter((signal) => signal.hit).length;
  return {
    positives: positives.length,
    baselineHit: baseline / positives.length,
    hit: hits / positives.length,
    loss: (baseline - hits) / positives.length,
    noMatchEmpty: negatives.length
      ? negatives.filter((signal) => emptied(signal, rule)).length / negatives.length
      : null,
  };
}

function analyse(signals: readonly Signal[]): string[] {
  const lines: string[] = [];
  const pct = (value: number | null) => (value === null ? "-" : `${(100 * value).toFixed(1)} %`);
  for (const corpus of ["docs", "wiki"] as const) {
    const scoped = signals.filter((signal) => signal.corpus === corpus);
    if (scoped.length === 0) continue;
    lines.push(
      `## ${corpus}`,
      "",
      "| Query | No-match | Coverage | Similarity | Jev none | Hit |",
      "| --- | --- | ---: | ---: | --- | --- |",
    );
    for (const signal of [...scoped].sort((left, right) => (right.similarity ?? 0) - (left.similarity ?? 0)))
      lines.push(
        `| ${signal.id} ${signal.query.slice(0, 60)} | ${signal.noMatch ? "yes" : ""} | ${signal.coverage.toFixed(2)} | ${signal.similarity?.toFixed(3) ?? "-"} | ${String(signal.jevNone)} | ${signal.hit ? "hit" : ""} |`,
      );
    lines.push(
      "",
      "| Coverage | Similarity | Jev none | Hit | Loss | No-match empty |",
      "| ---: | ---: | --- | ---: | ---: | ---: |",
    );
    for (const coverage of [0.6, 0.7, 0.8, 0.9, 0.99])
      for (const similarity of [0.55, 0.58, 0.6, 0.61, 0.62, 0.63, 0.64, 0.65, 0.66, 0.68, 0.7])
        for (const jevNone of [false, true]) {
          const result = evaluate(scoped, { coverage, similarity, jevNone });
          lines.push(
            `| ${coverage} | ${similarity} | ${jevNone ? "yes" : "no"} | ${pct(result.hit)} | ${pct(result.loss)} | ${pct(result.noMatchEmpty)} |`,
          );
        }
    lines.push("");
  }
  return lines;
}

async function main() {
  const reuse = flag("analyse");
  let signals: Signal[];
  if (reuse) signals = JSON.parse(readFileSync(resolve(reuse), "utf8")) as Signal[];
  else {
    const databaseUrl = requireLocalBenchmarkDatabase();
    const only = flag("only");
  if (only !== undefined && only !== "docs" && only !== "wiki") throw new Error("--only must be docs or wiki.");
    signals = [
      ...(only === "wiki" ? [] : await docsSignals()),
      ...(only === "docs" ? [] : await wikiSignals(databaseUrl)),
    ];
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(signals, null, 2)}\n`);
  }
  const markdown = analyse(signals).join("\n");
  writeFileSync(outPath.replace(/\.json$/, ".md"), `${markdown}\n`);
  process.stdout.write(
    `Harness-metered spend ${(budget.accountedMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD\nWrote ${outPath}\n`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(1);
  },
);
