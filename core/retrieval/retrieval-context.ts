import { AsyncLocalStorage } from "node:async_hooks";
import type { LocaleCode } from "@/i18n/locale-registry";

export type RetrievalCorpus = "docs" | "wiki";

export type RankableSection = {
  id: number;
  locale?: LocaleCode;
  section: { pageTitle: string; headingPath: readonly string[]; text: string };
};

export type SectionRanking = { order: number[]; abstained: boolean };

export type SectionRanker = (query: string, candidates: readonly RankableSection[]) => Promise<SectionRanking | null>;

export type SectionRankerFactory = (corpus: RetrievalCorpus) => SectionRanker | undefined;

export type RetrievalEmbeddingOutcome = "used" | "unavailable" | "timeout" | "none";
export type RetrievalRerankOutcome = "used" | "unavailable" | "failed" | "none";

export type RetrievalTiming = {
  corpus: RetrievalCorpus;
  totalMs: number;
  fullTextMs: number | null;
  embedding: RetrievalEmbeddingOutcome;
  embeddingMs: number | null;
  semanticMs: number | null;
  rerank: RetrievalRerankOutcome;
  rerankMs: number | null;
};

type RetrievalScope = {
  rankers?: SectionRankerFactory;
  timings?: RetrievalTiming[];
};

const RETRIEVAL_TIMINGS_PER_SCOPE = 32;

const retrievalScope = new AsyncLocalStorage<RetrievalScope>();

export function runWithSectionRanking<T>(rankers: SectionRankerFactory, run: () => T): T {
  return retrievalScope.run({ ...retrievalScope.getStore(), rankers }, run);
}

export function currentSectionRanker(corpus: RetrievalCorpus): SectionRanker | undefined {
  return retrievalScope.getStore()?.rankers?.(corpus);
}

export async function collectRetrievalTimings<T>(
  run: () => Promise<T>,
): Promise<{ value: T; timings: RetrievalTiming[] }> {
  const timings: RetrievalTiming[] = [];
  const value = await retrievalScope.run({ ...retrievalScope.getStore(), timings }, run);
  return { value, timings };
}

export function recordRetrievalTiming(timing: RetrievalTiming) {
  const timings = retrievalScope.getStore()?.timings;
  if (timings && timings.length < RETRIEVAL_TIMINGS_PER_SCOPE) timings.push(timing);
}
