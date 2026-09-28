import "dotenv/config";

import type {
  RetrievalTiming,
  SectionRanker,
} from "@/core/retrieval/retrieval-context";
import type { QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { AgentRetrievalGrant } from "@/ee/agent-chat/agent-usage.service";
import type { TenantUser } from "@/features/user/user.schema";
import type { WikiSearchResult } from "@/features/wiki/wiki.schema";
import type {
  DocsRetrievalEvalItem,
  WikiEvalQuery,
} from "./retrieval-eval-cases";

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
import { collectClassifierCharges } from "@/ee/agent-chat/classifier/metered";
import { hostedSectionRankers } from "@/ee/agent-chat/docs-rerank";
import { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import {
  embedWikiTexts,
  WIKI_EMBEDDING_MODEL,
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
import { wikiMarkdownSections } from "@/features/wiki/wiki-markdown-sections";
import { createMockUser } from "@/tests/helpers/mock-user";

import { requireLocalBenchmarkDatabase } from "./env";
import { DOCS_EMBEDDING_HELDOUT } from "./heldout-data/docs-embedding";
import { DOCS_HELDOUT } from "./heldout-data/docs";
import {
  DOCS_LIVE_CASE_LABELS,
  DOCS_RETRIEVAL_EVAL,
  WIKI_RETRIEVAL_CORPUS,
  WIKI_RETRIEVAL_QUERIES,
} from "./retrieval-eval-cases";
import { percentile } from "./stats";

const MICROCENTS_PER_USD = 100_000_000;
const WARMUP_QUERIES = [
  "warm-up: api keys",
  "warm-up: webhooks signature",
  "warm-up: Währung einstellen",
];

type Variant = "unified" | "unified-full-text";

const VARIANTS: readonly Variant[] = ["unified", "unified-full-text"];
type Ranked = { slug: string; anchor: string };
type DocsOutcome = {
  id: string;
  pageRank: number;
  finalSection: string | null;
  sectionHit: boolean;
  totalMs: number;
  rerank: "used" | "failed" | "none";
  embedding: RetrievalTiming["embedding"] | null;
};
type WikiOutcome = {
  query: string;
  category: WikiEvalQuery["category"];
  rank: number;
  sectionHit: boolean | null;
  empty: boolean;
  pass: boolean;
  totalMs: number;
  rerank: "used" | "failed" | "none";
  embedding: RetrievalTiming["embedding"] | null;
  top: string[];
};

const spend = {
  embeddingMicrocents: 0,
  jevMicrocents: 0,
  jevCalls: 0,
  jevAnswered: 0,
  embeddingCalls: 0,
};

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

const capUsd = Number(flag("cap") ?? "1.5");
const outPath = resolve(
  flag("out") ??
    `scripts/agent-benchmark/.runs/retrieval-eval/${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);

function spentUsd() {
  return (spend.embeddingMicrocents + spend.jevMicrocents) / MICROCENTS_PER_USD;
}

function assertBudget() {
  if (spentUsd() > capUsd)
    throw new Error(
      `Retrieval eval spend ${spentUsd().toFixed(4)} USD passed the cap of ${capUsd} USD.`,
    );
}

async function embedQuery(query: string): Promise<QueryVector | null> {
  const text = query.normalize("NFC").replace(/\s+/gu, " ").trim();
  spend.embeddingCalls += 1;
  try {
    const { vectors, charge } = await embedWikiTexts([text], "query");
    spend.embeddingMicrocents += charge.costMicrocents;
    return { vector: vectors[0], model: WIKI_EMBEDDING_MODEL };
  } catch {
    return null;
  }
}

function tracked(
  ranker: SectionRanker | undefined,
  outcome: { rerank: "used" | "failed" | "none" },
): SectionRanker | undefined {
  if (!ranker) return undefined;
  return async (query, candidates) => {
    const { value, charges } = await collectClassifierCharges(() =>
      ranker(query, candidates),
    );
    for (const charge of charges) {
      spend.jevMicrocents += charge.costMicrocents;
      spend.jevCalls += 1;
      if (charge.answered) spend.jevAnswered += 1;
    }
    outcome.rerank = value && value.length > 0 ? "used" : "failed";
    return value;
  };
}

function jevFor(query: string, corpus: "docs" | "wiki") {
  const factory = hostedSectionRankers(query);
  if (!factory)
    throw new Error(
      "The hosted re-rank is unavailable: set APP_MODE to cloud and provide AI_GATEWAY_API_KEY.",
    );
  return factory(corpus);
}

function docsOutcome(
  item: DocsRetrievalEvalItem,
  ranked: readonly Ranked[],
  totalMs: number,
  rerank: DocsOutcome["rerank"],
  embedding: DocsOutcome["embedding"],
): DocsOutcome {
  const pages = new Set([
    item.slug,
    ...item.alternatives.map((target) => target.split("#")[0]),
  ]);
  const sections = new Set([...item.anchors, ...item.alternatives]);
  const [best] = ranked;
  const finalSection = best ? `${best.slug}#${best.anchor}` : null;
  return {
    id: item.id,
    pageRank: ranked.findIndex((hit) => pages.has(hit.slug)) + 1,
    finalSection,
    sectionHit: finalSection !== null && sections.has(finalSection),
    totalMs,
    rerank,
    embedding,
  };
}

async function timed<T>(run: () => Promise<T>) {
  const started = performance.now();
  const { value, timings } = await collectRetrievalTimings(run);
  return { value, timings, totalMs: Math.round(performance.now() - started) };
}

async function docsRun(
  item: DocsRetrievalEvalItem,
  variant: Variant,
  repo: PrismaDocsChunkRepo,
): Promise<DocsOutcome> {
  const input = {
    query: item.query,
    locale: item.docsLocale,
    source: "docs" as const,
  };
  const outcome: { rerank: DocsOutcome["rerank"] } = { rerank: "none" };
  const full = variant === "unified";
  const { value, timings, totalMs } = await timed(() =>
    unifiedDocsSearch(input, {
      repo,
      embed: full ? embedQuery : null,
      ranker: full ? tracked(jevFor(item.query, "docs"), outcome) : undefined,
    }),
  );
  return docsOutcome(
    item,
    value.pages.map(({ section }) => section),
    totalMs,
    outcome.rerank,
    timings[0]?.embedding ?? null,
  );
}

function docsMetrics(outcomes: readonly DocsOutcome[]) {
  const n = outcomes.length;
  const share = (predicate: (entry: DocsOutcome) => boolean) =>
    outcomes.filter(predicate).length / n;
  return {
    items: n,
    pageR1: share((entry) => entry.pageRank === 1),
    pageR5: share((entry) => entry.pageRank >= 1 && entry.pageRank <= 5),
    pageMrr:
      outcomes.reduce(
        (sum, entry) => sum + (entry.pageRank > 0 ? 1 / entry.pageRank : 0),
        0,
      ) / n,
    finalSectionHit: share((entry) => entry.sectionHit),
    rerankUsed: share((entry) => entry.rerank === "used"),
    embeddingUsed: share((entry) => entry.embedding === "used"),
    p50Ms: percentile(
      outcomes.map((entry) => entry.totalMs),
      50,
    ),
    p95Ms: percentile(
      outcomes.map((entry) => entry.totalMs),
      95,
    ),
  };
}

const DOCS_SETS: Array<[string, readonly DocsRetrievalEvalItem[]]> = [
  ["D", DOCS_LIVE_CASE_LABELS],
  ["DH", DOCS_HELDOUT],
  ["DE", DOCS_EMBEDDING_HELDOUT],
  ["all", DOCS_RETRIEVAL_EVAL],
];

async function evaluateDocs() {
  const repo = new PrismaDocsChunkRepo();
  await repo.ensureCorpus(docsCorpus());
  for (const query of WARMUP_QUERIES) {
    const item = { ...DOCS_RETRIEVAL_EVAL[0], id: "warm-up", query };
    for (const variant of VARIANTS) await docsRun(item, variant, repo);
  }
  const results: Record<Variant, DocsOutcome[]> = { unified: [], "unified-full-text": [] };
  for (const item of DOCS_RETRIEVAL_EVAL) {
    for (const variant of VARIANTS) results[variant].push(await docsRun(item, variant, repo));
    assertBudget();
  }
  const metrics = Object.fromEntries(
    Object.entries(results).map(([variant, outcomes]) => [
      variant,
      Object.fromEntries(
        DOCS_SETS.map(([name, items]) => {
          const ids = new Set(items.map((item) => item.id));
          return [
            name,
            docsMetrics(outcomes.filter((entry) => ids.has(entry.id))),
          ];
        }),
      ),
    ]),
  );
  return { metrics, outcomes: results };
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
    const { vectors, charge } = await embedWikiTexts(texts, kind);
    spend.embeddingMicrocents += charge.costMicrocents;
    spend.embeddingCalls += 1;
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

function wikiSectionHit(
  item: WikiSearchResult,
  answer: string,
  markdownByTitle: Map<string, string>,
) {
  const expected = answer.toLocaleLowerCase();
  if (item.snippet.replaceAll("**", "").toLocaleLowerCase().includes(expected))
    return true;
  const markdown = markdownByTitle.get(item.title) ?? "";
  const section = wikiMarkdownSections(markdown).find(
    ({ offset }) => offset === (item.offset ?? 0),
  );
  if (!section) return false;
  return markdown
    .slice(section.offset, section.end)
    .replaceAll("**", "")
    .toLocaleLowerCase()
    .includes(expected);
}

async function evaluateWiki(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const companyId = randomUUID();
  const userId = randomUUID();
  const user: TenantUser = createMockUser({ id: userId, companyId });
  const markdownByTitle = new Map<string, string>();
  const semantic: WikiSemanticRetrieval = {
    embedder: { embedQuery },
    scheduler: { schedule: () => Promise.resolve() },
  };
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
    for (const [index, page] of WIKI_RETRIEVAL_CORPUS.entries()) {
      const markdown = WikiMarkdownSchema.parse(page.markdown);
      markdownByTitle.set(page.title, markdown);
      await client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
        [
          randomUUID(),
          companyId,
          page.title,
          markdown,
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
      process.stderr.write(
        `Wiki index step ${step + 1}: ${result.indexed} pages, remaining ${String(result.remaining)}\n`,
      );
      indexed += result.indexed;
      if (result.indexed === 0 || indexed >= WIKI_RETRIEVAL_CORPUS.length)
        break;
    }
    if (indexed !== WIKI_RETRIEVAL_CORPUS.length)
      throw new Error(
        `Indexed ${indexed} of ${WIKI_RETRIEVAL_CORPUS.length} Wiki pages.`,
      );

    const search = async (
      labelled: WikiEvalQuery,
      variant: Variant,
    ): Promise<WikiOutcome> => {
      const outcome: { rerank: WikiOutcome["rerank"] } = { rerank: "none" };
      const withSemantic = variant === "unified";
      const interactor = new SearchWikiPagesInteractor(
        new PrismaWikiPageRepo(),
        "stored",
        withSemantic ? semantic : null,
      );
      const ranker =
        variant === "unified"
          ? tracked(jevFor(labelled.query, "wiki"), outcome)
          : undefined;
      const invoke = () =>
        runWithTenant(user, () =>
          interactor.invoke({ query: labelled.query, page: 1, pageSize: 5 }),
        );
      const {
        value: result,
        timings,
        totalMs,
      } = await timed(() =>
        ranker ? runWithSectionRanking(() => ranker, invoke) : invoke(),
      );
      if (!result.ok)
        throw new Error(`Wiki search failed for ${labelled.query}`);
      const titles = result.data.items.map((item) => item.title);
      const rank =
        titles.findIndex((title) => labelled.expect.includes(title)) + 1;
      const [top] = result.data.items;
      const sectionHit =
        labelled.answer === undefined
          ? null
          : rank === 1 && wikiSectionHit(top, labelled.answer, markdownByTitle);
      const empty = titles.length === 0;
      return {
        query: labelled.query,
        category: labelled.category,
        rank,
        sectionHit,
        empty,
        pass:
          labelled.expect.length === 0
            ? empty
            : rank === 1 && sectionHit !== false,
        totalMs,
        rerank: outcome.rerank,
        embedding: timings[0]?.embedding ?? null,
        top: titles.slice(0, 3),
      };
    };

    for (const query of WARMUP_QUERIES) await search({ category: "no-match", query, expect: [] }, "unified");

    const results: Record<Variant, WikiOutcome[]> = { unified: [], "unified-full-text": [] };
    for (const labelled of WIKI_RETRIEVAL_QUERIES) {
      for (const variant of VARIANTS) results[variant].push(await search(labelled, variant));
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

function wikiMetrics(outcomes: readonly WikiOutcome[]) {
  const positives = outcomes.filter((entry) => entry.category !== "no-match");
  const negatives = outcomes.filter((entry) => entry.category === "no-match");
  const sections = positives.filter((entry) => entry.sectionHit !== null);
  const share = <T>(list: readonly T[], predicate: (entry: T) => boolean) =>
    list.length ? list.filter(predicate).length / list.length : null;
  return {
    queries: outcomes.length,
    positives: positives.length,
    r1: share(positives, (entry) => entry.rank === 1),
    r5: share(positives, (entry) => entry.rank >= 1),
    mrr:
      positives.reduce(
        (sum, entry) => sum + (entry.rank > 0 ? 1 / entry.rank : 0),
        0,
      ) / positives.length,
    finalSectionHit: share(sections, (entry) => entry.sectionHit === true),
    sectionItems: sections.length,
    noMatchEmpty: share(negatives, (entry) => entry.empty),
    pass: share(outcomes, (entry) => entry.pass),
    rerankUsed: share(outcomes, (entry) => entry.rerank === "used"),
    embeddingUsed: share(outcomes, (entry) => entry.embedding === "used"),
    p50Ms: percentile(
      outcomes.map((entry) => entry.totalMs),
      50,
    ),
    p95Ms: percentile(
      outcomes.map((entry) => entry.totalMs),
      95,
    ),
  };
}

function wikiSummary(results: Record<Variant, WikiOutcome[]>) {
  const categories = [
    ...new Set(WIKI_RETRIEVAL_QUERIES.map((entry) => entry.category)),
  ];
  const metrics = Object.fromEntries(
    Object.entries(results).map(([variant, outcomes]) => [
      variant,
      {
        overall: wikiMetrics(outcomes),
        byCategory: Object.fromEntries(
          categories.map((category) => [
            category,
            wikiMetrics(
              outcomes.filter((entry) => entry.category === category),
            ),
          ]),
        ),
      },
    ]),
  );
  return {
    metrics,
    misses: Object.fromEntries(
      Object.entries(results).map(([variant, outcomes]) => [
        variant,
        outcomes
          .filter((entry) => !entry.pass)
          .map(
            (entry) =>
              `${entry.category} | ${entry.query} -> ${JSON.stringify(entry.top)}`,
          ),
      ]),
    ),
  };
}

const pct = (value: number | null) =>
  value === null ? "-" : `${(100 * value).toFixed(1)} %`;
const ms = (value: number | null) =>
  value === null ? "-" : `${(value / 1000).toFixed(2)} s`;

function renderMarkdown(
  docs: Awaited<ReturnType<typeof evaluateDocs>> | null,
  wiki: ReturnType<typeof wikiSummary> | null,
) {
  const lines: string[] = [];
  if (docs) renderDocs(lines, docs);
  if (wiki) renderWiki(lines, wiki);
  lines.push(
    "",
    `Spend: embeddings ${(spend.embeddingMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD over ${spend.embeddingCalls} calls, Jev ${(spend.jevMicrocents / MICROCENTS_PER_USD).toFixed(4)} USD over ${spend.jevCalls} calls (${spend.jevAnswered} answered).`,
  );
  return lines.join("\n");
}

function renderDocs(
  lines: string[],
  docs: Awaited<ReturnType<typeof evaluateDocs>>,
) {
  lines.push(
    "| Docs set | Pipeline | Items | Page R@1 | Page R@5 | Page MRR | Final-section hit | Re-rank used | Embedding used | p50 | p95 |",
  );
  lines.push(
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const [set] of DOCS_SETS)
    for (const variant of VARIANTS) {
      const m = (
        docs.metrics as Record<
          string,
          Record<string, ReturnType<typeof docsMetrics>>
        >
      )[variant][set];
      lines.push(
        `| ${set} | ${variant} | ${m.items} | ${pct(m.pageR1)} | ${pct(m.pageR5)} | ${m.pageMrr.toFixed(3)} | ${pct(m.finalSectionHit)} | ${pct(m.rerankUsed)} | ${pct(m.embeddingUsed)} | ${ms(m.p50Ms)} | ${ms(m.p95Ms)} |`,
      );
    }
  lines.push("");
}

function renderWiki(lines: string[], wiki: ReturnType<typeof wikiSummary>) {
  lines.push(
    "| Wiki pipeline | Queries | R@1 | R@5 | MRR | Final-section hit | No-match empty | Pass | Re-rank used | Embedding used | p50 | p95 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const variant of VARIANTS) {
    const m = (
      wiki.metrics as Record<
        string,
        { overall: ReturnType<typeof wikiMetrics> }
      >
    )[variant].overall;
    lines.push(
      `| ${variant} | ${m.queries} | ${pct(m.r1)} | ${pct(m.r5)} | ${m.mrr.toFixed(3)} | ${pct(m.finalSectionHit)} (${m.sectionItems}) | ${pct(m.noMatchEmpty)} | ${pct(m.pass)} | ${pct(m.rerankUsed)} | ${pct(m.embeddingUsed)} | ${ms(m.p50Ms)} | ${ms(m.p95Ms)} |`,
    );
  }
  const categories = [
    ...new Set(WIKI_RETRIEVAL_QUERIES.map((entry) => entry.category)),
  ];
  lines.push(
    "",
    `| Wiki category | ${VARIANTS.map((v) => `${v} pass`).join(" | ")} |`,
    "| --- | ---: | ---: |",
  );
  for (const category of categories)
    lines.push(
      `| ${category} | ${VARIANTS.map((variant) => pct((wiki.metrics as Record<string, { byCategory: Record<string, ReturnType<typeof wikiMetrics>> }>)[variant].byCategory[category].pass)).join(" | ")} |`,
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
  const docs = only === "wiki" ? null : await evaluateDocs();
  const wikiResults = only === "docs" ? null : await evaluateWiki(databaseUrl);
  const wiki = wikiResults ? wikiSummary(wikiResults) : null;
  const markdown = renderMarkdown(docs, wiki);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify({ spend: { ...spend, usd: spentUsd() }, docs, wiki: { ...wiki, outcomes: wikiResults } }, null, 2)}\n`,
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
    process.stderr.write(`Spend so far: ${spentUsd().toFixed(4)} USD\n`);
    process.exit(1);
  },
);
