import type {
  RankableSection,
  RetrievalCorpus,
  RetrievalEmbeddingOutcome,
  RetrievalRerankOutcome,
  RetrievalTiming,
  SectionRanker,
} from "./retrieval-context";

import { recordRetrievalTiming } from "./retrieval-context";

export const RETRIEVAL_RRF_K = 60;
export const RETRIEVAL_EMBEDDING_WAIT_MS = 1_100;
export const RETRIEVAL_SEMANTIC_MIN_SIMILARITY = 0.5;

export type QueryVector = { vector: number[]; model: string };
export type QueryEmbedding = (query: string, wait?: QueryEmbeddingWait) => Promise<QueryVector | null>;

export class QueryEmbeddingWait {
  private state: "waiting" | "claimed" | "abandoned" = "waiting";

  claim(): boolean {
    if (this.state === "waiting") this.state = "claimed";
    return this.state === "claimed";
  }

  abandon(): boolean {
    if (this.state === "waiting") this.state = "abandoned";
    return this.state === "abandoned";
  }
}

export type FusedRetrieval<Key extends string> = {
  ranked: Key[];
  fullText: Key[];
  semantic: Key[] | null;
  vector: QueryVector | null;
};

const elapsed = (started: number) => Math.max(0, Math.round(performance.now() - started));

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

export class RetrievalStopwatch {
  private readonly started = performance.now();
  fullTextMs: number | null = null;
  embedding: RetrievalEmbeddingOutcome = "none";
  embeddingMs: number | null = null;
  semanticMs: number | null = null;
  rerank: RetrievalRerankOutcome = "none";
  rerankMs: number | null = null;

  constructor(private readonly corpus: RetrievalCorpus) {}

  async time<T>(stage: "fullTextMs" | "semanticMs" | "embeddingMs" | "rerankMs", run: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await run();
    } finally {
      this[stage] = elapsed(started);
    }
  }

  finish(): RetrievalTiming {
    const timing: RetrievalTiming = {
      corpus: this.corpus,
      totalMs: elapsed(this.started),
      fullTextMs: this.fullTextMs,
      embedding: this.embedding,
      embeddingMs: this.embeddingMs,
      semanticMs: this.semanticMs,
      rerank: this.rerank,
      rerankMs: this.rerankMs,
    };
    recordRetrievalTiming(timing);
    return timing;
  }
}

export async function fuseFullTextAndSemantic<Key extends string>(args: {
  query: string;
  stopwatch: RetrievalStopwatch;
  fullText: () => Promise<{ keys: Key[]; pinned?: Key[] }>;
  embed: QueryEmbedding | null;
  semantic: (vector: QueryVector) => Promise<Key[] | null>;
  embeddingWaitMs?: number;
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
    lists: semantic ? [fullText.keys, semantic] : [fullText.keys],
  });
  return { ranked, fullText: fullText.keys, semantic, vector: semantic ? vector : null };
}

export async function rerankSections(args: {
  query: string;
  stopwatch: RetrievalStopwatch;
  candidates: readonly RankableSection[];
  ranker: SectionRanker | undefined;
}): Promise<number[] | null> {
  const { stopwatch } = args;
  if (!args.ranker) {
    stopwatch.rerank = "unavailable";
    return null;
  }
  if (args.candidates.length < 2) return null;
  const ranker = args.ranker;
  try {
    const order = await stopwatch.time("rerankMs", () => ranker(args.query, args.candidates));
    const known = new Set(args.candidates.map(({ id }) => id));
    const chosen = [...new Set(order ?? [])].filter((id) => known.has(id));
    stopwatch.rerank = chosen.length > 0 ? "used" : "failed";
    return chosen.length > 0 ? chosen : null;
  } catch {
    stopwatch.rerank = "failed";
    return null;
  }
}
