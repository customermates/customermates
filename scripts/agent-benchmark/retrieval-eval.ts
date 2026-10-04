import "dotenv/config";

import type {
  RankableSection,
  RetrievalTiming,
  SectionRanker,
  SectionRanking,
} from "@/core/retrieval/retrieval-context";
import type { QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { AgentRetrievalGrant } from "@/ee/agent-chat/agent-usage.service";
import type { TenantUser } from "@/features/user/user.schema";
import type { DocsRetrievalEvalItem } from "./retrieval-eval-cases";
import type {
  WikiBenchmarkCategory,
  WikiBenchmarkQuery,
} from "./wiki-retrieval-benchmark";

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Client } from "pg";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import {
  collectRetrievalTimings,
  runWithSectionRanking,
} from "@/core/retrieval/retrieval-context";
import { RETRIEVAL_EMBEDDING_WAIT_MS } from "@/core/retrieval/retrieval-pipeline";
import { collectClassifierCharges } from "@/ee/agent-chat/classifier/metered";
import {
  docsRankSpec,
  docsRankState,
  docsRankUserMessage,
  hostedSectionRankers,
} from "@/ee/agent-chat/docs-rerank";
import { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import {
  embedWikiTexts,
  WIKI_EMBEDDING_MODEL,
  wikiEmbeddingWorstCaseMicrocents,
} from "@/ee/wiki-retrieval/wiki-embedding-model";
import { WikiSemanticIndexService } from "@/ee/wiki-retrieval/wiki-semantic-index.service";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";
import { unifiedDocsSearch } from "@/features/mcp-tools/docs-unified-search";
import { PrismaDocsChunkRepo } from "@/features/mcp-tools/prisma-docs-chunk.repository";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import {
  SearchWikiPagesInteractor,
  type WikiSemanticRetrieval,
} from "@/features/wiki/search-wiki-pages.interactor";
import { WikiMarkdownSchema } from "@/features/wiki/wiki.schema";
import { createMockUser } from "@/tests/helpers/mock-user";

import { RetrievalBudget } from "./retrieval-budget";
import { estimateClassifierCostMicrocents } from "@/ee/agent-chat/classifier/metered";

import { requireLocalBenchmarkDatabase } from "./env";
import { DOCS_EMBEDDING_HELDOUT } from "./heldout-data/docs-embedding";
import { DOCS_HELDOUT } from "./heldout-data/docs";
import {
  DOCS_LIVE_CASE_LABELS,
  DOCS_NO_MATCH_EVAL,
  DOCS_RETRIEVAL_EVAL,
} from "./retrieval-eval-cases";
import { mcnemarExact, percentile } from "./stats";
import { loadWikiRetrievalBenchmark } from "./wiki-retrieval-benchmark";

const MICROCENTS_PER_USD = 100_000_000;
const SIGNIFICANCE = 0.05;
const WARMUP_QUERIES = [
  "warm-up: api keys",
  "warm-up: webhooks signature",
  "warm-up: Währung einstellen",
];

const RETRIEVAL_COMBOS = ["FTS", "FTS+E", "FTS+J", "FTS+E+J"] as const;
const EMBEDDING_MODES = ["E-wait", "E-unbounded"] as const;

type Combo = (typeof RETRIEVAL_COMBOS)[number];
type EmbeddingMode = (typeof EMBEDDING_MODES)[number];
type Corpus = "docs" | "wiki";

type CachedEmbedding = { vector: QueryVector | null; ms: number };
type CachedRank = { order: SectionRanking | null; ms: number };

type Outcome = {
  id: string;
  group: string;
  language: string;
  noMatch: boolean;
  pageRank: number;
  empty: boolean;
  hit: boolean;
  top: string | null;
  fullTextMs: number;
  localMs: number;
  embeddingMs: number | null;
  embedding: RetrievalTiming["embedding"] | null;
  rerank: RetrievalTiming["rerank"] | null;
  jevMs: number | null;
  modelledMs: number;
};

type Metrics = {
  items: number;
  hits: number;
  hit: number;
  positives: number;
  answerableHits: number;
  answerableHit: number | null;
  pageR1: number | null;
  pageR5: number | null;
  mrr: number | null;
  noMatchEmpty: number | null;
  embeddingUsed: number;
  rerankUsed: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

type Arm = { combo: Combo; mode: EmbeddingMode; floor: boolean };
type ArmKey = `${Combo}|${EmbeddingMode}|${"floor" | "no-floor"}`;

const spend = {
  embeddingMicrocents: 0,
  indexingMicrocents: 0,
  jevMicrocents: 0,
  jevCalls: 0,
  jevAnswered: 0,
  embeddingCalls: 0,
};

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value.`);
  return value;
}

const budget = new RetrievalBudget(
  flag("cap") ?? (process.argv.includes("--cap") ? "" : "1.5"),
);
const outPath = resolve(
  flag("out") ??
    `scripts/agent-benchmark/.runs/retrieval-eval/${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);

function spentUsd() {
  return (
    (spend.embeddingMicrocents +
      spend.indexingMicrocents +
      spend.jevMicrocents) /
    MICROCENTS_PER_USD
  );
}

function assertBudget() {
  budget.assertAvailable();
}

async function budgetedEmbedding(texts: string[], kind: "query" | "document") {
  const maximum = Math.max(1, wikiEmbeddingWorstCaseMicrocents(texts));
  const attempts = kind === "document" ? 3 : 1;
  return budget.run(
    maximum * attempts,
    () => embedWikiTexts(texts, kind),
    (result) => result.charge.costSource === "measured" ? result.charge.costMicrocents + maximum * (attempts - 1) : undefined,
  );
}

const embeddings = new Map<string, CachedEmbedding>();
const ranks = new Map<string, CachedRank>();

async function embedOnce(query: string): Promise<CachedEmbedding> {
  const text = query.normalize("NFC").replace(/\s+/gu, " ").trim();
  const cached = embeddings.get(text);
  if (cached) return cached;
  spend.embeddingCalls += 1;
  const started = performance.now();
  let vector: QueryVector | null = null;
  try {
    const { vectors, charge } = await budgetedEmbedding([text], "query");
    spend.embeddingMicrocents += charge.costMicrocents;
    vector = { vector: vectors[0], model: WIKI_EMBEDDING_MODEL };
  } catch {
    vector = null;
  }
  assertBudget();
  const entry = { vector, ms: Math.round(performance.now() - started) };
  embeddings.set(text, entry);
  return entry;
}

function embeddingFor(
  entry: CachedEmbedding,
  mode: EmbeddingMode,
): QueryVector | null {
  if (mode === "E-wait" && entry.ms > RETRIEVAL_EMBEDDING_WAIT_MS) return null;
  return entry.vector;
}

function cachedRanker(
  query: string,
  corpus: Corpus,
  used: { key: string | null },
): SectionRanker {
  const factory = hostedSectionRankers(query);
  const ranker = factory?.(corpus);
  if (!ranker)
    throw new Error(
      "The hosted re-rank is unavailable: set APP_MODE to cloud and provide AI_GATEWAY_API_KEY.",
    );
  return async (rankQuery: string, candidates: readonly RankableSection[]) => {
    const key = JSON.stringify([corpus, query, rankQuery, candidates]);
    used.key = key;
    const cached = ranks.get(key);
    if (cached) return cached.order;
    const maximum = Math.max(
      1,
      3 *
        estimateClassifierCostMicrocents(
          docsRankSpec(candidates, corpus, rankQuery),
          docsRankState(rankQuery, docsRankUserMessage(query)),
          "jev",
        ),
    );
    const started = performance.now();
    const { value, charges } = await budget.run(
      maximum,
      () => collectClassifierCharges(() => ranker(rankQuery, candidates)),
      ({ charges }) =>
        charges.length > 0 && charges.every((charge) => charge.measured)
          ? charges.reduce((total, charge) => total + charge.costMicrocents, 0)
          : undefined,
    );
    for (const charge of charges) {
      spend.jevMicrocents += charge.costMicrocents;
      spend.jevCalls += 1;
      if (charge.answered) spend.jevAnswered += 1;
    }
    ranks.set(key, {
      order: value,
      ms: Math.round(performance.now() - started),
    });
    return value;
  };
}

function modelledLatency(args: {
  arm: Arm;
  localMs: number;
  fullTextMs: number;
  embedding: CachedEmbedding;
  jevMs: number | null;
}): number {
  const { arm, localMs, fullTextMs, embedding, jevMs } = args;
  const uses = arm.combo.includes("E");
  const wait = !uses
    ? 0
    : arm.mode === "E-wait"
      ? Math.min(embedding.ms, RETRIEVAL_EMBEDDING_WAIT_MS)
      : embedding.ms;
  return localMs + Math.max(0, wait - fullTextMs) + (jevMs ?? 0);
}

async function measured<T>(
  arm: Arm,
  query: string,
  corpus: Corpus,
  run: (ranker: SectionRanker | undefined) => Promise<T>,
) {
  const used: { key: string | null } = { key: null };
  const ranker = arm.combo.includes("J")
    ? cachedRanker(query, corpus, used)
    : undefined;
  const started = performance.now();
  const { value, timings } = await collectRetrievalTimings(() => run(ranker));
  assertBudget();
  const elapsed = performance.now() - started;
  const timing = timings[0] ?? null;
  const jevMs = used.key ? (ranks.get(used.key)?.ms ?? null) : null;
  const rerankMs = timing?.rerankMs ?? 0;
  const localMs = Math.max(
    0,
    Math.round(elapsed - (jevMs !== null ? rerankMs : 0)),
  );
  return { value, timing, jevMs, localMs, fullTextMs: timing?.fullTextMs ?? 0 };
}

const shipped = process.argv.includes("--shipped");

function arms(): Arm[] {
  if (shipped)
    return [true, false].map((floor) => ({
      combo: "FTS+E+J" as const,
      mode: "E-wait" as const,
      floor,
    }));
  return EMBEDDING_MODES.flatMap((mode) =>
    RETRIEVAL_COMBOS.map((combo) => ({ combo, mode, floor: true })),
  );
}

const armKey = (arm: Arm): ArmKey =>
  `${arm.combo}|${arm.mode}|${arm.floor ? "floor" : "no-floor"}`;
const modeLabel = (mode: EmbeddingMode) =>
  mode === "E-wait" ? `E-${RETRIEVAL_EMBEDDING_WAIT_MS}` : mode;

type DocsEvalItem = DocsRetrievalEvalItem & {
  noMatch?: boolean;
  lang?: string;
};

async function docsRun(
  item: DocsEvalItem,
  arm: Arm,
  repo: PrismaDocsChunkRepo,
  group: string,
): Promise<Outcome> {
  const embedding = await embedOnce(item.query);
  const vector = embeddingFor(embedding, arm.mode);
  const { value, timing, jevMs, localMs, fullTextMs } = await measured(
    arm,
    item.query,
    "docs",
    (ranker) =>
      unifiedDocsSearch(
        { query: item.query, locale: item.docsLocale, source: "docs" },
        {
          repo,
          embed: arm.combo.includes("E") ? () => Promise.resolve(vector) : null,
          ranker,
          relevanceFloor: arm.floor ? undefined : null,
        },
      ),
  );
  const pages = new Set([
    item.slug,
    ...item.alternatives.map((target) => target.split("#")[0]),
  ]);
  const sections = new Set([...item.anchors, ...item.alternatives]);
  const ranked = value.pages.map(({ section }) => section);
  const [best] = ranked;
  const top = best ? `${best.slug}#${best.anchor}` : null;
  return {
    id: item.id,
    group,
    language: item.lang ?? item.docsLocale,
    noMatch: item.noMatch === true,
    pageRank: ranked.findIndex((hit) => pages.has(hit.slug)) + 1,
    empty: ranked.length === 0,
    hit: item.noMatch ? ranked.length === 0 : top !== null && sections.has(top),
    top,
    fullTextMs,
    localMs,
    embeddingMs: arm.combo.includes("E") ? embedding.ms : null,
    embedding: timing?.embedding ?? null,
    rerank: timing?.rerank ?? null,
    jevMs,
    modelledMs: modelledLatency({ arm, localMs, fullTextMs, embedding, jevMs }),
  };
}

const DOCS_GROUPS: Array<[string, readonly DocsEvalItem[]]> = [
  ["D", DOCS_LIVE_CASE_LABELS],
  ["DH", DOCS_HELDOUT],
  ["DE", DOCS_EMBEDDING_HELDOUT],
  [
    "DN",
    DOCS_NO_MATCH_EVAL.map((item) => ({
      ...item,
      slug: "",
      anchors: [],
      alternatives: [],
      noMatch: true,
    })),
  ],
];

async function evaluateDocs(): Promise<Record<ArmKey, Outcome[]>> {
  const repo = new PrismaDocsChunkRepo();
  await repo.ensureCorpus(docsCorpus());
  for (const query of WARMUP_QUERIES) {
    const item = { ...DOCS_RETRIEVAL_EVAL[0], id: "warm-up", query };
    await docsRun(
      item,
      { combo: "FTS+E", mode: "E-unbounded", floor: true },
      repo,
      "warm-up",
    );
  }
  const results = Object.fromEntries(
    arms().map((arm) => [armKey(arm), [] as Outcome[]]),
  ) as Record<ArmKey, Outcome[]>;
  for (const [group, items] of DOCS_GROUPS)
    for (const item of items) {
      for (const arm of arms())
        results[armKey(arm)].push(await docsRun(item, arm, repo, group));
      assertBudget();
    }
  return results;
}

class EvalEmbeddingService extends WikiEmbeddingService {
  constructor() {
    super(undefined as never);
  }

  override authorizeQuery() {
    return Promise.resolve(this.grant());
  }

  override authorizeIndexing() {
    return Promise.resolve(this.grant());
  }

  override async embedTexts(
    _grant: AgentRetrievalGrant,
    texts: string[],
    kind: "query" | "document",
  ) {
    const { vectors, charge } = await budgetedEmbedding(texts, kind);
    spend.indexingMicrocents += charge.costMicrocents;
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

async function evaluateWiki(
  databaseUrl: string,
): Promise<Record<ArmKey, Outcome[]>> {
  const benchmark = loadWikiRetrievalBenchmark();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const companyId = randomUUID();
  const userId = randomUUID();
  const user: TenantUser = createMockUser({ id: userId, companyId });
  const slugByTitle = new Map(
    benchmark.pages.map((page) => [page.title, page.slug]),
  );
  try {
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)',
      [companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [
        userId,
        `wiki-eval-${userId}@example.invalid`,
        "Wiki",
        "Evaluator",
        companyId,
      ],
    );
    for (const [index, page] of benchmark.pages.entries()) {
      await client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "kind", "whenToUse", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::"WikiPageKind", $6, $7, $7)',
        [
          randomUUID(),
          companyId,
          page.title,
          WikiMarkdownSchema.parse(page.markdown),
          page.kind,
          page.whenToUse,
          new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        ],
      );
    }
    const indexer = new WikiSemanticIndexService(
      new PrismaWikiPageRepo(),
      new EvalEmbeddingService(),
    );
    let indexed = 0;
    for (let step = 0; step < 50; step += 1) {
      const result = await runWithTenant(user, () => indexer.indexStalePages());
      assertBudget();
      process.stderr.write(
        `Wiki index step ${step + 1}: ${result.indexed} pages, remaining ${String(result.remaining)}\n`,
      );
      indexed += result.indexed;
      if (result.indexed === 0 || indexed >= benchmark.pages.length) break;
    }
    if (indexed !== benchmark.pages.length)
      throw new Error(
        `Indexed ${indexed} of ${benchmark.pages.length} Wiki pages.`,
      );

    const search = async (
      labelled: WikiBenchmarkQuery,
      arm: Arm,
    ): Promise<Outcome> => {
      const embedding = await embedOnce(labelled.query);
      const vector = embeddingFor(embedding, arm.mode);
      const semantic: WikiSemanticRetrieval | null = arm.combo.includes("E")
        ? {
            embedder: { embedQuery: () => Promise.resolve(vector) },
            scheduler: { schedule: () => Promise.resolve() },
            relevanceFloor: arm.floor ? undefined : null,
          }
        : null;
      const interactor = new SearchWikiPagesInteractor(
        new PrismaWikiPageRepo(),
        "stored",
        semantic,
      );
      const { value, timing, jevMs, localMs, fullTextMs } = await measured(
        arm,
        labelled.query,
        "wiki",
        async (ranker) => {
          const invoke = () =>
            runWithTenant(user, () =>
              interactor.invoke({
                query: labelled.query,
                page: 1,
                pageSize: 5,
              }),
            );
          return ranker
            ? runWithSectionRanking(() => ranker, invoke)
            : invoke();
        },
      );
      if (!value.ok) throw new Error(`Wiki search failed for ${labelled.id}`);
      const items = value.data.items.map((item) => ({
        slug: slugByTitle.get(item.title) ?? item.title,
        heading: item.section?.split(" > ").at(-1) ?? "",
      }));
      const golds = new Set(labelled.targets.map((target) => target.slug));
      const [best] = items;
      const noMatch = labelled.category === "no-match";
      const hit = noMatch
        ? items.length === 0
        : best !== undefined &&
          labelled.targets.some(
            (target) =>
              target.slug === best.slug && target.section === best.heading,
          );
      return {
        id: labelled.id,
        group: labelled.category,
        language: labelled.language,
        noMatch,
        pageRank: items.findIndex((item) => golds.has(item.slug)) + 1,
        empty: items.length === 0,
        hit,
        top: best ? `${best.slug}#${best.heading}` : null,
        fullTextMs,
        localMs,
        embeddingMs: arm.combo.includes("E") ? embedding.ms : null,
        embedding: timing?.embedding ?? null,
        rerank: timing?.rerank ?? null,
        jevMs,
        modelledMs: modelledLatency({
          arm,
          localMs,
          fullTextMs,
          embedding,
          jevMs,
        }),
      };
    };

    for (const query of WARMUP_QUERIES)
      await search(
        {
          id: "warm-up",
          language: "en",
          category: "no-match",
          query,
          targets: [],
        },
        { combo: "FTS+E", mode: "E-unbounded", floor: true },
      );
    const results = Object.fromEntries(
      arms().map((arm) => [armKey(arm), [] as Outcome[]]),
    ) as Record<ArmKey, Outcome[]>;
    for (const labelled of benchmark.queries) {
      for (const arm of arms())
        results[armKey(arm)].push(await search(labelled, arm));
      assertBudget();
    }
    return results;
  } finally {
    await client.query('DELETE FROM "WikiPageChunk" WHERE "companyId" = $1', [
      companyId,
    ]);
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = $1', [
      companyId,
    ]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [
      companyId,
    ]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  }
}

function metrics(outcomes: readonly Outcome[]): Metrics {
  const positives = outcomes.filter((entry) => !entry.noMatch);
  const negatives = outcomes.filter((entry) => entry.noMatch);
  const share = <T>(list: readonly T[], predicate: (entry: T) => boolean) =>
    list.length ? list.filter(predicate).length / list.length : null;
  const hits = outcomes.filter((entry) => entry.hit).length;
  const answerableHits = positives.filter((entry) => entry.hit).length;
  return {
    items: outcomes.length,
    hits,
    hit: outcomes.length ? hits / outcomes.length : 0,
    positives: positives.length,
    answerableHits,
    answerableHit: positives.length ? answerableHits / positives.length : null,
    pageR1: share(positives, (entry) => entry.pageRank === 1),
    pageR5: share(
      positives,
      (entry) => entry.pageRank >= 1 && entry.pageRank <= 5,
    ),
    mrr: positives.length
      ? positives.reduce(
          (sum, entry) => sum + (entry.pageRank > 0 ? 1 / entry.pageRank : 0),
          0,
        ) / positives.length
      : null,
    noMatchEmpty: share(negatives, (entry) => entry.empty),
    embeddingUsed: share(outcomes, (entry) => entry.embedding === "used") ?? 0,
    rerankUsed: share(outcomes, (entry) => entry.rerank === "used") ?? 0,
    p50Ms: percentile(
      outcomes.map((entry) => entry.modelledMs),
      50,
    ),
    p95Ms: percentile(
      outcomes.map((entry) => entry.modelledMs),
      95,
    ),
  };
}

function selectStages(
  outcomes: Readonly<Record<Combo, readonly { id: string; hit: boolean }[]>>,
): {
  best: Combo;
  chosen: Combo;
  comparisons: Record<
    Combo,
    { p: number; onlyCombo: number; onlyBest: number }
  >;
} {
  const hits = (combo: Combo) =>
    outcomes[combo].filter((entry) => entry.hit).length;
  const best = RETRIEVAL_COMBOS.reduce((leader, combo) =>
    hits(combo) > hits(leader) ? combo : leader,
  );
  const bestById = new Map(
    outcomes[best].map((entry) => [entry.id, entry.hit]),
  );
  const comparisons = Object.fromEntries(
    RETRIEVAL_COMBOS.map((combo) => {
      const result = mcnemarExact(
        outcomes[combo].map((entry) => ({
          control: bestById.get(entry.id) ?? false,
          candidate: entry.hit,
        })),
      );
      return [
        combo,
        {
          p: result.p,
          onlyCombo: result.candidateOnly,
          onlyBest: result.controlOnly,
        },
      ];
    }),
  ) as Record<Combo, { p: number; onlyCombo: number; onlyBest: number }>;
  const chosen =
    RETRIEVAL_COMBOS.find(
      (combo) =>
        hits(combo) >= hits(best) || comparisons[combo].p >= SIGNIFICANCE,
    ) ?? best;
  return { best, chosen, comparisons };
}

const pct = (value: number | null) =>
  value === null ? "-" : `${(100 * value).toFixed(1)} %`;
const sec = (value: number | null) =>
  value === null ? "-" : `${(value / 1000).toFixed(2)} s`;
const pValue = (value: number) =>
  value >= 0.001 ? value.toFixed(3) : value.toExponential(1);

function render(
  corpus: Corpus,
  results: Record<ArmKey, Outcome[]>,
  lines: string[],
) {
  const title =
    corpus === "docs"
      ? "Docs (110 labelled questions and 10 no-match questions)"
      : "Wiki (blind benchmark, 160 queries)";
  lines.push(`## ${title}`, "");
  for (const mode of EMBEDDING_MODES) {
    const byCombo = Object.fromEntries(
      RETRIEVAL_COMBOS.map((combo) => [
        combo,
        results[`${combo}|${mode}|floor`],
      ]),
    ) as Record<Combo, Outcome[]>;
    const decision = selectStages(byCombo);
    lines.push(
      `### ${modeLabel(mode)}`,
      "",
      "| Combo | Items | Final-section hit@1 | Page R@1 | Page R@5 | Page MRR | No-match empty | Embedding used | Re-rank used | p50 | p95 | vs best (only combo / only best) | McNemar p |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const combo of RETRIEVAL_COMBOS) {
      const m = metrics(byCombo[combo]);
      const comparison = decision.comparisons[combo];
      const vs =
        combo === decision.best
          ? "best"
          : `${comparison.onlyCombo} / ${comparison.onlyBest}`;
      lines.push(
        `| ${combo} | ${m.items} | ${m.hits} (${pct(m.hit)}) | ${pct(m.pageR1)} | ${pct(m.pageR5)} | ${m.mrr === null ? "-" : m.mrr.toFixed(3)} | ${pct(m.noMatchEmpty)} | ${pct(m.embeddingUsed)} | ${pct(m.rerankUsed)} | ${sec(m.p50Ms)} | ${sec(m.p95Ms)} | ${vs} | ${combo === decision.best ? "-" : pValue(comparison.p)} |`,
      );
    }
    lines.push(
      "",
      `Decision (${modeLabel(mode)}): best ${decision.best}; chosen **${decision.chosen}**.`,
      "",
    );
    for (const [label, key] of [
      [corpus === "docs" ? "Set" : "Category", "group"],
      ["Language", "language"],
    ] as const) {
      const values = [...new Set(byCombo.FTS.map((entry) => entry[key]))];
      lines.push(
        `| ${label} | Items | ${RETRIEVAL_COMBOS.map((combo) => `${combo} hit@1`).join(" | ")} | ${RETRIEVAL_COMBOS.map((combo) => `${combo} page R@1`).join(" | ")} |`,
        `| --- | ---: | ${RETRIEVAL_COMBOS.map(() => "---:").join(" | ")} | ${RETRIEVAL_COMBOS.map(() => "---:").join(" | ")} |`,
      );
      for (const value of values) {
        const slice = (combo: Combo) =>
          metrics(byCombo[combo].filter((entry) => entry[key] === value));
        lines.push(
          `| ${value} | ${slice("FTS").items} | ${RETRIEVAL_COMBOS.map((combo) => pct(slice(combo).hit)).join(" | ")} | ${RETRIEVAL_COMBOS.map((combo) => pct(slice(combo).pageR1)).join(" | ")} |`,
        );
      }
      lines.push("");
    }
  }
}

function renderShipped(
  corpus: Corpus,
  results: Record<ArmKey, Outcome[]>,
  lines: string[],
) {
  const floorKey: ArmKey = "FTS+E+J|E-wait|floor";
  const noFloorKey: ArmKey = "FTS+E+J|E-wait|no-floor";
  const withFloor = results[floorKey];
  const withoutFloor = results[noFloorKey];
  lines.push(
    `## ${corpus === "docs" ? "Docs" : "Wiki (blind benchmark)"}: FTS+E+J, ${modeLabel("E-wait")} ms wait`,
    "",
    "| Arm | Items | Answerable | Answerable final-section hit@1 | Page R@1 | Page R@5 | Page MRR | No-match | No-match empty | Embedding used | Re-rank used | p50 | p95 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const [label, outcomes] of [
    ["Floor (shipped)", withFloor],
    ["No floor", withoutFloor],
  ] as const) {
    const m = metrics(outcomes);
    lines.push(
      `| ${label} | ${m.items} | ${m.positives} | ${m.answerableHits} (${pct(m.answerableHit)}) | ${pct(m.pageR1)} | ${pct(m.pageR5)} | ${m.mrr === null ? "-" : m.mrr.toFixed(3)} | ${m.items - m.positives} | ${pct(m.noMatchEmpty)} | ${pct(m.embeddingUsed)} | ${pct(m.rerankUsed)} | ${sec(m.p50Ms)} | ${sec(m.p95Ms)} |`,
    );
  }
  const noFloorById = new Map(
    withoutFloor.map((entry) => [entry.id, entry.hit]),
  );
  const answerable = withFloor.filter((entry) => !entry.noMatch);
  const paired = mcnemarExact(
    answerable.map((entry) => ({
      control: noFloorById.get(entry.id) ?? false,
      candidate: entry.hit,
    })),
  );
  const emptied = answerable
    .filter((entry) => entry.empty)
    .map((entry) => entry.id);
  lines.push(
    "",
    `Floor against no floor on answerable items: only the floor hit ${paired.candidateOnly}, only no floor hit ${paired.controlOnly} (exact McNemar p = ${pValue(paired.p)}). Answerable items the floor emptied: ${emptied.length ? emptied.join(", ") : "none"}.`,
    "",
  );
  for (const [label, key] of [
    [corpus === "docs" ? "Set" : "Category", "group"],
    ["Language", "language"],
  ] as const) {
    const values = [...new Set(withFloor.map((entry) => entry[key]))];
    lines.push(
      `| ${label} | Items | Floor hit@1 | No floor hit@1 | Floor page R@1 | No floor page R@1 |`,
      "| --- | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const value of values) {
      const slice = (outcomes: readonly Outcome[]) =>
        metrics(outcomes.filter((entry) => entry[key] === value));
      const floor = slice(withFloor);
      const open = slice(withoutFloor);
      lines.push(
        `| ${value} | ${floor.items} | ${pct(floor.hit)} | ${pct(open.hit)} | ${pct(floor.pageR1)} | ${pct(open.pageR1)} |`,
      );
    }
    lines.push("");
  }
}

function embeddingLatencyLines(lines: string[]) {
  const warmUps = new Set(WARMUP_QUERIES);
  const values = [...embeddings.entries()]
    .filter(([text]) => !warmUps.has(text))
    .map(([, entry]) => entry);
  const ms = values.map((entry) => entry.ms);
  const within = values.filter(
    (entry) => entry.vector && entry.ms <= RETRIEVAL_EMBEDDING_WAIT_MS,
  ).length;
  const failed = values.filter((entry) => !entry.vector).length;
  lines.push(
    "## Query embedding latency",
    "",
    `${values.length} query embeddings (one per distinct query): p50 ${percentile(ms, 50)} ms, p95 ${percentile(ms, 95)} ms, max ${Math.max(...ms)} ms; ${within} (${pct(values.length ? within / values.length : null)}) returned a vector within ${RETRIEVAL_EMBEDDING_WAIT_MS} ms; ${failed} failed.`,
    "",
  );
}

async function main() {
  const databaseUrl = requireLocalBenchmarkDatabase();
  const key = process.env.AI_GATEWAY_API_KEY?.trim() ?? "";
  if (!key || key === "XXX")
    throw new Error(
      "AI_GATEWAY_API_KEY must hold a real Gateway key for the retrieval eval.",
    );
  for (const name of [
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_DEPLOYMENT_ID",
  ])
    if (process.env[name] !== undefined)
      throw new Error(
        "The retrieval eval never runs in a deployment environment.",
      );
  const only = flag("only");
  if (only !== undefined && only !== "docs" && only !== "wiki") throw new Error("--only must be docs or wiki.");
  const docs = only === "wiki" ? null : await evaluateDocs();
  const wiki = only === "docs" ? null : await evaluateWiki(databaseUrl);
  const lines: string[] = [];
  const draw = shipped ? renderShipped : render;
  if (docs) draw("docs", docs, lines);
  if (wiki) draw("wiki", wiki, lines);
  embeddingLatencyLines(lines);
  lines.push(
    `Harness-metered spend: query embeddings ${(spend.embeddingMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD over ${spend.embeddingCalls} calls, Wiki indexing ${(spend.indexingMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD, Jev ${(spend.jevMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD over ${spend.jevCalls} calls (${spend.jevAnswered} answered).`,
  );
  lines.push(`Conservative budget accounting (including uncertain failed requests and possible retries): ${(budget.accountedMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD.`);
  const markdown = lines.join("\n");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify({ spend: { ...spend, usd: spentUsd(), reservedOrConservativelyAccountedUsd: budget.accountedMicrocents / MICROCENTS_PER_USD }, embeddings: Object.fromEntries(embeddings), docs, wiki }, null, 2)}\n`,
  );
  writeFileSync(outPath.replace(/\.json$/, ".md"), `${markdown}\n`);
  process.stdout.write(`${markdown}\n\nWrote ${outPath}\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.stderr.write(`Spend so far: ${spentUsd().toFixed(4)} USD; conservatively accounted: ${(budget.accountedMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD\n`);
    process.exit(1);
  },
);
