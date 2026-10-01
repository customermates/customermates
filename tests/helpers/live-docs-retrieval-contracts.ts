import type { RankableSection, RetrievalTiming, SectionRanker } from "@/core/retrieval/retrieval-context";
import type { QueryEmbedding, QueryVector } from "@/core/retrieval/retrieval-pipeline";
import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { UnifiedDocsDeps } from "@/features/mcp-tools/docs-unified-search";

import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import { collectRetrievalTimings, recordRetrievalTiming } from "@/core/retrieval/retrieval-context";
import { docsPendingEmbeddingTexts } from "@/features/mcp-tools/docs-embedding-input";
import {
  classifyMetered,
  collectClassifierCharges,
  estimateClassifierCostMicrocents,
  hostedDocsRerankModel,
} from "@/ee/agent-chat/classifier/metered";
import { jevRequestBody } from "@/ee/agent-chat/classifier/jev-runner";
import { docsRankOrder, docsRankSpec, docsRankState, docsRankUserMessage } from "@/ee/agent-chat/docs-rerank";
import type { ContentLocale } from "@/i18n/locale-registry";
import { createLiveDocsRetrievalAdmission } from "./live-docs-retrieval-admission";
import { isWikiSemanticSearchAvailable } from "@/ee/wiki-retrieval/wiki-embedding.service";
import {
  embedWikiTexts,
  WIKI_EMBEDDING_BATCH_SIZE,
  WIKI_EMBEDDING_MODEL,
  wikiEmbeddingWorstCaseMicrocents,
} from "@/ee/wiki-retrieval/wiki-embedding-model";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";
import { env } from "@/env";
import { requireLocalBenchmarkDatabase } from "@/scripts/agent-benchmark/env";
import { RetrievalBudget } from "@/scripts/agent-benchmark/retrieval-budget";

const MICROCENTS_PER_USD = 100_000_000;

type Receipt = {
  purpose: "docs-index" | "query" | "jev";
  model: string;
  costMicrocents: number;
  measured: boolean;
  answered?: boolean;
};
type ContractOutcome = {
  title: string;
  status: "passed" | "failed";
  timings: RetrievalTiming[];
};
type InvocationInput = {
  kind: "search" | "excerpt";
  query: string;
  locale: ContentLocale;
  source: "docs" | "api" | "all";
  slug?: string;
};
type RankFailure =
  | { kind: "http"; status: number }
  | {
      kind: "deadline" | "network" | "unreadable-response" | "not-requested" | "invalid-ranking";
    };
type RankTrace = {
  query: string;
  candidateCount: number;
  requestUtf8Bytes: number;
  candidates: {
    id: number;
    pageTitle: string;
    headingPath: readonly string[];
    sectionChars: number;
    descriptionChars: number;
    evidenceChars: number;
  }[];
  elapsedMs: number;
  selectedIds: number[];
  abstained: boolean;
  answered: boolean;
  failure: RankFailure | null;
};
type InvocationTrace = InvocationInput & {
  id: number;
  queueWaitMs: number;
  elapsedMs: number;
  status: "running" | "passed" | "failed";
  timings: RetrievalTiming[];
  ranks: RankTrace[];
};

export function liveDocsRetrievalContractsEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
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
  const configuredReportPath = process.env.LIVE_DOCS_RETRIEVAL_REPORT;
  if (!configuredReportPath || !isAbsolute(configuredReportPath))
    throw new Error("Live documentation contracts require an absolute report path.");

  const reportPath = configuredReportPath;

  const receipts: Receipt[] = [];
  const contracts: ContractOutcome[] = [];
  const inFlight = new Set<Promise<unknown>>();
  const admission = createLiveDocsRetrievalAdmission();
  const invocationScope = new AsyncLocalStorage<InvocationTrace>();
  const invocations: InvocationTrace[] = [];
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
    return track(
      budget.run(
        maximum,
        () =>
          embedWikiTexts(texts, purpose === "query" ? "query" : "document", {
            maxRetries: 0,
            onCharge: (charge) =>
              receipts.push({
                purpose,
                model: charge.model,
                costMicrocents: charge.costMicrocents,
                measured: charge.costSource === "measured",
              }),
          }),
        ({ charge }) => (charge.costSource === "measured" ? charge.costMicrocents : undefined),
      ),
    );
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
    const model = hostedDocsRerankModel();
    if (!model) throw new Error("The hosted documentation re-ranker is unavailable.");
    const spec = docsRankSpec(candidates, "docs", query);
    const state = docsRankState(query, docsRankUserMessage(query));
    const maximum = Math.max(1, 3 * estimateClassifierCostMicrocents(spec, state));
    const trace: RankTrace = {
      query,
      candidateCount: candidates.length,
      requestUtf8Bytes: Buffer.byteLength(JSON.stringify(jevRequestBody(spec, state)), "utf8"),
      candidates: candidates.map(({ id, section }) => {
        const title = `${section.pageTitle} > ${section.headingPath.join(" > ")}`;
        const description = spec.questions[0].options[`s${id}`];
        const evidence = description.startsWith(`${title}: `) ? description.slice(title.length + 2) : "";
        return {
          id,
          pageTitle: section.pageTitle,
          headingPath: [...section.headingPath],
          sectionChars: section.text.length,
          descriptionChars: description.length,
          evidenceChars: evidence.length,
        };
      }),
      elapsedMs: 0,
      selectedIds: [],
      abstained: false,
      answered: false,
      failure: null,
    };
    invocationScope.getStore()?.ranks.push(trace);
    const started = performance.now();
    const observedFetch: typeof fetch = async (input, init) => {
      try {
        const response = await fetch(input, init);
        if (!response.ok) trace.failure = { kind: "http", status: response.status };
        return response;
      } catch (error) {
        trace.failure = {
          kind: init?.signal?.aborted ? "deadline" : "network",
        };
        throw error;
      }
    };
    try {
      const { value } = await track(
        budget.run(
          maximum,
          async () => {
            const result = await collectClassifierCharges(async () => {
              const classified = await classifyMetered("docs_rerank", spec, state, model, { fetch: observedFetch });
              trace.answered = classified.result !== null;
              if (!classified.result && !trace.failure) {
                trace.failure = {
                  kind: classified.charge ? "unreadable-response" : "not-requested",
                };
              }
              const ranking = docsRankOrder(classified.result, candidates);
              if (classified.result && !ranking && !trace.failure) trace.failure = { kind: "invalid-ranking" };
              return ranking;
            });
            for (const charge of result.charges) {
              receipts.push({
                purpose: "jev",
                model: charge.model,
                costMicrocents: charge.costMicrocents,
                measured: charge.measured,
                answered: charge.answered,
              });
            }
            return result;
          },
          ({ charges }) =>
            charges.length > 0 && charges.every(({ measured }) => measured)
              ? charges.reduce((sum, charge) => sum + charge.costMicrocents, 0)
              : undefined,
        ),
      );
      trace.selectedIds = [...(value?.order ?? [])];
      trace.abstained = value?.abstained === true;
      return value;
    } finally {
      trace.elapsedMs = Math.max(0, Math.round(performance.now() - started));
    }
  };

  function admit<T>(input: InvocationInput, invoke: () => Promise<T>): Promise<T> {
    const queued = performance.now();
    const trace: InvocationTrace = {
      ...input,
      id: invocations.length,
      queueWaitMs: 0,
      elapsedMs: 0,
      status: "running",
      timings: [],
      ranks: [],
    };
    invocations.push(trace);
    return admission.run(() =>
      invocationScope.run(trace, async () => {
        trace.queueWaitMs = Math.max(0, Math.round(performance.now() - queued));
        const started = performance.now();
        try {
          const { value, timings } = await collectRetrievalTimings(invoke);
          trace.timings = timings;
          for (const timing of timings) recordRetrievalTiming(timing);
          trace.status = "passed";
          return value;
        } catch (error) {
          trace.status = "failed";
          throw error;
        } finally {
          trace.elapsedMs = Math.max(0, Math.round(performance.now() - started));
        }
      }),
    );
  }

  const deps: UnifiedDocsDeps = { repo, embed, ranker };

  async function prepare() {
    if (process.env.RUN_DATABASE_TESTS !== "true")
      throw new Error("Live documentation contracts require the database test gate.");

    if (!process.env.DATABASE_URL || !process.env.DIRECT_URL)
      throw new Error("Live documentation contracts require both database URLs.");

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
      const texts = docsPendingEmbeddingTexts(corpus, chunks);
      const { vectors: found } = await embedded(texts, "docs-index");
      await repo.storeEmbeddings(
        WIKI_EMBEDDING_MODEL,
        chunks.map(({ contentHash }, index) => ({
          contentHash,
          embedding: `[${found[index].join(",")}]`,
        })),
      );
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
    await admission.drain();
    await Promise.allSettled([...inFlight]);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          corpusBuildHash: docsCorpus().buildHash,
          embeddingModel: WIKI_EMBEDDING_MODEL,
          indexed,
          capUsd: budget.capMicrocents / MICROCENTS_PER_USD,
          conservativelyAccountedUsd: budget.accountedMicrocents / MICROCENTS_PER_USD,
          measuredReceiptUsd:
            receipts.filter(({ measured }) => measured).reduce((sum, charge) => sum + charge.costMicrocents, 0) /
            MICROCENTS_PER_USD,
          estimatedAttemptUsd:
            receipts.filter(({ measured }) => !measured).reduce((sum, charge) => sum + charge.costMicrocents, 0) /
            MICROCENTS_PER_USD,
          receipts,
          contracts,
          admissionConcurrency: 1,
          invocations,
        },
        null,
        2,
      )}\n`,
    );
    budget.assertAvailable();
  }

  return { deps, prepare, run, finish, admit };
}
