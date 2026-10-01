import type { RankableSection, RetrievalTiming, SectionRanker } from "@/core/retrieval/retrieval-context";
import type { QueryEmbedding, QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { ClassifierCharge } from "@/ee/agent-chat/classifier/metered";
import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { UnifiedDocsDeps } from "@/features/mcp-tools/docs-unified-search";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import { collectRetrievalTimings } from "@/core/retrieval/retrieval-context";
import { retrievalChunkText } from "@/core/retrieval/retrieval-chunks";
import { collectClassifierCharges, estimateClassifierCostMicrocents } from "@/ee/agent-chat/classifier/metered";
import { docsRankSpec, docsRankState, docsRankUserMessage, hostedSectionRankers } from "@/ee/agent-chat/docs-rerank";
import { isWikiSemanticSearchAvailable } from "@/ee/wiki-retrieval/wiki-embedding.service";
import { embedWikiTexts, WIKI_EMBEDDING_BATCH_SIZE, WIKI_EMBEDDING_MODEL, wikiEmbeddingWorstCaseMicrocents } from "@/ee/wiki-retrieval/wiki-embedding-model";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";
import { env } from "@/env";
import { requireLocalBenchmarkDatabase } from "@/scripts/agent-benchmark/env";
import { RetrievalBudget } from "@/scripts/agent-benchmark/retrieval-budget";

const MICROCENTS_PER_USD = 100_000_000;

type Receipt = { purpose: "docs-index" | "query" | "jev"; model: string; costMicrocents: number; measured: boolean; answered?: boolean };
type ContractOutcome = { title: string; status: "passed" | "failed"; timings: RetrievalTiming[] };

export function liveDocsRetrievalContractsEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  const flag = environment.LIVE_DOCS_RETRIEVAL_CONTRACTS;
  if (flag !== undefined && flag !== "true" && flag !== "false")
    throw new Error("LIVE_DOCS_RETRIEVAL_CONTRACTS must be true or false.");
  return flag === "true";
}

export function createLiveDocsRetrievalContracts(repo: DocsChunkRepo) {
  if (!liveDocsRetrievalContractsEnabled()) throw new Error("Live documentation contracts require explicit opt-in.");
  const cap = process.env.LIVE_DOCS_RETRIEVAL_CAP_USD;
  if (cap === undefined) throw new Error("Live documentation contracts require an approved USD cap.");
  const budget = new RetrievalBudget(cap);
  const reportPath = process.env.LIVE_DOCS_RETRIEVAL_REPORT;
  if (!reportPath || !isAbsolute(reportPath)) throw new Error("Live documentation contracts require an absolute report path.");

  const receipts: Receipt[] = [];
  const contracts: ContractOutcome[] = [];
  const inFlight = new Set<Promise<unknown>>();
  const vectors = new Map<string, QueryVector>();
  const pendingVectors = new Map<string, Promise<QueryVector | null>>();
  let indexed = 0;
  let prepared = false;

  function track<T>(invoke: Promise<T>): Promise<T> {
    const pending = invoke.finally(() => inFlight.delete(pending));
    inFlight.add(pending);
    return pending;
  }

  async function embedded(texts: string[], purpose: "docs-index" | "query") {
    const maximum = Math.max(1, wikiEmbeddingWorstCaseMicrocents(texts));
    return track(budget.run(
      maximum,
      () => embedWikiTexts(texts, purpose === "query" ? "query" : "document", {
        maxRetries: 0,
        onCharge: (charge) => receipts.push({ purpose, model: charge.model, costMicrocents: charge.costMicrocents, measured: charge.costSource === "measured" }),
      }),
      ({ charge }) => charge.costSource === "measured" ? charge.costMicrocents : undefined,
    ));
  }

  const embed: QueryEmbedding = async (query, wait) => {
    if (!prepared) throw new Error("Live documentation contracts are not prepared.");
    budget.assertAvailable();
    const text = query.normalize("NFC").replace(/\s+/gu, " ").trim();
    const cached = vectors.get(text);
    if (cached) return cached;
    let pending = pendingVectors.get(text);
    if (!pending) {
      pending = embedded([text], "query")
        .then(({ vectors: found }) => {
          const vector = { vector: found[0], model: WIKI_EMBEDDING_MODEL };
          vectors.set(text, vector);
          return vector;
        })
        .catch(() => null)
        .finally(() => pendingVectors.delete(text));
      pendingVectors.set(text, pending);
    }
    const vector = await pending;
    return wait?.claim() === false ? null : vector;
  };

  const ranker: SectionRanker = async (query, candidates: readonly RankableSection[]) => {
    if (!prepared) throw new Error("Live documentation contracts are not prepared.");
    budget.assertAvailable();
    const invoke = hostedSectionRankers(query)?.("docs");
    if (!invoke) throw new Error("The hosted documentation re-ranker is unavailable.");
    const maximum = Math.max(1, 3 * estimateClassifierCostMicrocents(
      docsRankSpec(candidates, "docs"),
      docsRankState(query, docsRankUserMessage(query)),
    ));
    const { value } = await track(budget.run(
      maximum,
      async () => {
        const result = await collectClassifierCharges(() => invoke(query, candidates));
        for (const charge of result.charges as ClassifierCharge[])
          receipts.push({ purpose: "jev", model: charge.model, costMicrocents: charge.costMicrocents, measured: charge.measured, answered: charge.answered });
        return result;
      },
      ({ charges }) => charges.length > 0 && charges.every(({ measured }) => measured)
        ? charges.reduce((sum, charge) => sum + charge.costMicrocents, 0)
        : undefined,
    ));
    return value;
  };

  const deps: UnifiedDocsDeps = { repo, embed, ranker };

  async function prepare() {
    if (process.env.RUN_DATABASE_TESTS !== "true") throw new Error("Live documentation contracts require the database test gate.");
    if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) throw new Error("Live documentation contracts require both database URLs.");
    const database = new URL(requireLocalBenchmarkDatabase());
    const name = decodeURIComponent(database.pathname.slice(1));
    if (!name || ["customermates", "postgres", "template0", "template1"].includes(name))
      throw new Error("Live documentation contracts require an owned temporary database.");
    if (env.APP_MODE !== "cloud" || !isWikiSemanticSearchAvailable())
      throw new Error("Live documentation contracts require the configured cloud provider.");
    if (!(await repo.semanticIndexAvailable())) throw new Error("Live documentation contracts require pgvector.");
    const corpus = docsCorpus();
    await repo.ensureCorpus(corpus);
    for (;;) {
      const chunks = await repo.pendingEmbeddings(corpus.buildHash, WIKI_EMBEDDING_MODEL, WIKI_EMBEDDING_BATCH_SIZE);
      if (chunks.length === 0) break;
      const texts = chunks.map(({ label, body }) => retrievalChunkText(label, body));
      const { vectors: found } = await embedded(texts, "docs-index");
      await repo.storeEmbeddings(WIKI_EMBEDDING_MODEL, chunks.map(({ contentHash }, index) => ({
        contentHash,
        embedding: `[${found[index].join(",")}]`,
      })));
      indexed += chunks.length;
    }
    prepared = true;
  }

  async function run(title: string, test: () => Promise<void>) {
    budget.assertAvailable();
    let failed = false;
    let failure: unknown;
    const { timings } = await collectRetrievalTimings(async () => {
      try {
        await test();
      } catch (error) {
        failed = true;
        failure = error;
      }
    });
    contracts.push({ title, status: failed ? "failed" : "passed", timings });
    budget.assertAvailable();
    if (failed) throw failure;
  }

  async function finish() {
    await Promise.allSettled([...inFlight]);
    mkdirSync(dirname(reportPath!), { recursive: true });
    writeFileSync(reportPath!, `${JSON.stringify({
      corpusBuildHash: docsCorpus().buildHash,
      embeddingModel: WIKI_EMBEDDING_MODEL,
      indexed,
      capUsd: budget.capMicrocents / MICROCENTS_PER_USD,
      conservativelyAccountedUsd: budget.accountedMicrocents / MICROCENTS_PER_USD,
      measuredReceiptUsd: receipts.filter(({ measured }) => measured).reduce((sum, charge) => sum + charge.costMicrocents, 0) / MICROCENTS_PER_USD,
      estimatedAttemptUsd: receipts.filter(({ measured }) => !measured).reduce((sum, charge) => sum + charge.costMicrocents, 0) / MICROCENTS_PER_USD,
      receipts,
      contracts,
    }, null, 2)}\n`);
    budget.assertAvailable();
  }

  return { deps, prepare, run, finish };
}
