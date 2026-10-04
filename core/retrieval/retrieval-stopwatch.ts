import type {
  RetrievalCorpus,
  RetrievalEmbeddingOutcome,
  RetrievalRerankOutcome,
  RetrievalTiming,
} from "./retrieval-context";
import { recordRetrievalTiming } from "./retrieval-context";
import { elapsed } from "./retrieval-pipeline";

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
