import { QueryEmbeddingWait } from "./query-embedding-wait";
import type { RetrievalStopwatch } from "./retrieval-stopwatch";
import type { RankableSection, SectionRanker, SectionRanking } from "./retrieval-context";

export const RETRIEVAL_RRF_K = 60;
export const RETRIEVAL_EMBEDDING_WAIT_MS = 1_100;
export const RETRIEVAL_SEMANTIC_MIN_SIMILARITY = 0.5;

export type RelevanceFloor = { coverage: number; similarity: number };
export const RETRIEVAL_RELEVANCE_FLOOR: RelevanceFloor = { coverage: 0.9, similarity: 0.6 };

export type QueryVector = { vector: number[]; model: string };
export type QueryEmbedding = (query: string, wait?: QueryEmbeddingWait) => Promise<QueryVector | null>;

export type FusedRetrieval<Key extends string> = {
  ranked: Key[];
  fullText: Key[];
  semantic: Key[] | null;
  vector: QueryVector | null;
  relevance: RelevanceVerdict;
};

export type RelevanceVerdict = "kept" | "dropped" | "rerank";

export type RetrievalEvidence = { pinned: number; coverage: number; similarity: number | null };

export function relevanceVerdict(
  evidence: RetrievalEvidence,
  floor: RelevanceFloor | null = RETRIEVAL_RELEVANCE_FLOOR,
): RelevanceVerdict {
  if (!floor || evidence.similarity === null || evidence.pinned > 0 || evidence.coverage >= floor.coverage)
    return "kept";
  return evidence.similarity < floor.similarity ? "dropped" : "rerank";
}

export function keepsResults(relevance: RelevanceVerdict, ranking: SectionRanking | null): boolean {
  if (relevance === "dropped") return false;
  return relevance === "kept" || ranking?.abstained !== true;
}

export const elapsed = (started: number) => Math.max(0, Math.round(performance.now() - started));

export function fuseRankings<Key extends string>(args: {
  pinned?: readonly Key[];
  lists: readonly (readonly Key[])[];
}): Key[] {
  const position = (key: Key) =>
    Math.min(...args.lists.map((list) => list.indexOf(key)).filter((index) => index >= 0), Number.MAX_SAFE_INTEGER);
  const pinned = [...new Set(args.pinned ?? [])].sort((left, right) => position(left) - position(right));
  const placed = new Set<Key>(pinned);
  const scores = new Map<Key, number>();
  const firstSeen = new Map<Key, number>();
  for (const list of args.lists) {
    list.forEach((key, index) => {
      if (placed.has(key)) return;
      scores.set(key, (scores.get(key) ?? 0) + 1 / (RETRIEVAL_RRF_K + index + 1));
      if (!firstSeen.has(key)) firstSeen.set(key, firstSeen.size);
    });
  }
  const fused = [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || (firstSeen.get(left[0]) ?? 0) - (firstSeen.get(right[0]) ?? 0))
    .map(([key]) => key);
  return [...pinned, ...fused];
}

async function withinDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  gives: () => boolean,
): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      if (gives()) resolve(null);
    }, deadlineMs);
  });
  try {
    return await Promise.race([promise.then((value) => ({ value })), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fuseFullTextAndSemantic<Key extends string>(args: {
  query: string;
  stopwatch: RetrievalStopwatch;
  fullText: () => Promise<{ keys: Key[]; pinned?: Key[]; coverage: number }>;
  embed: QueryEmbedding | null;
  semantic: (vector: QueryVector) => Promise<{ keys: Key[]; similarity: number | null } | null>;
  embeddingWaitMs?: number;
  relevanceFloor?: RelevanceFloor | null;
}): Promise<FusedRetrieval<Key>> {
  const { stopwatch, embed: vectorFor } = args;
  const wait = new QueryEmbeddingWait();
  const embedding = vectorFor
    ? stopwatch.time("embeddingMs", () => vectorFor(args.query, wait).catch(() => null))
    : Promise.resolve(null);
  const [fullText, embedded] = await Promise.all([
    stopwatch.time("fullTextMs", args.fullText),
    vectorFor
      ? withinDeadline(embedding, args.embeddingWaitMs ?? RETRIEVAL_EMBEDDING_WAIT_MS, () => wait.abandon())
      : null,
  ]);
  const vector = embedded?.value ?? null;
  if (!vectorFor) stopwatch.embedding = "none";
  else if (!embedded) stopwatch.embedding = "timeout";
  else stopwatch.embedding = vector ? "used" : "unavailable";

  const semantic = vector ? await stopwatch.time("semanticMs", () => args.semantic(vector)) : null;
  if (vector && !semantic) stopwatch.embedding = "unavailable";
  const ranked = fuseRankings({
    pinned: fullText.pinned,
    lists: semantic ? [fullText.keys, semantic.keys] : [fullText.keys],
  });
  const relevance = relevanceVerdict(
    {
      pinned: fullText.pinned?.length ?? 0,
      coverage: fullText.coverage,
      similarity: semantic ? semantic.similarity : null,
    },
    args.relevanceFloor,
  );
  return {
    ranked: relevance === "dropped" ? [] : ranked,
    fullText: fullText.keys,
    semantic: semantic?.keys ?? null,
    vector: semantic ? vector : null,
    relevance,
  };
}

export async function rerankSections(args: {
  query: string;
  stopwatch: RetrievalStopwatch;
  candidates: readonly RankableSection[];
  ranker: SectionRanker | undefined;
  relevance?: RelevanceVerdict;
}): Promise<SectionRanking | null> {
  const { stopwatch } = args;
  if (!args.ranker) {
    stopwatch.rerank = "unavailable";
    return null;
  }
  if (args.candidates.length === 0 || (args.candidates.length === 1 && args.relevance !== "rerank")) return null;
  const ranker = args.ranker;
  try {
    const ranking = await stopwatch.time("rerankMs", () => ranker(args.query, args.candidates));
    const known = new Set(args.candidates.map(({ id }) => id));
    const chosen = [...new Set(ranking?.order ?? [])].filter((id) => known.has(id));
    stopwatch.rerank = chosen.length > 0 ? "used" : "failed";
    if (ranking?.abstained === true && args.relevance === "kept")
      return { order: args.candidates.map(({ id }) => id), abstained: true };
    return chosen.length > 0 ? { order: chosen, abstained: ranking?.abstained === true } : null;
  } catch {
    stopwatch.rerank = "failed";
    return null;
  }
}
