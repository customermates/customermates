import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";

import { retrievalChunkText } from "@/core/retrieval/retrieval-chunks";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";

import { isWikiSemanticSearchAvailable } from "./wiki-embedding.service";
import {
  embedWikiTexts,
  WIKI_EMBEDDING_BATCH_SIZE,
  WIKI_EMBEDDING_MODEL,
  wikiEmbeddingAttemptCharge,
  wikiEmbeddingWorstCaseMicrocents,
} from "./wiki-embedding-model";

const DOCS_INDEX_BATCHES_PER_STEP = 8;

function vectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}

export class DocsSemanticIndexService {
  constructor(
    private repo: DocsChunkRepo,
    private usage: AgentUsageService,
  ) {}

  async available(): Promise<boolean> {
    if (!isWikiSemanticSearchAvailable() || !(await this.repo.semanticIndexAvailable())) return false;
    return this.usage.admitsPlatformRetrieval();
  }

  async indexPending(): Promise<{ indexed: number; remaining: boolean }> {
    const corpus = docsCorpus();
    await this.repo.ensureCorpus(corpus);
    if (!(await this.available())) return { indexed: 0, remaining: false };
    let indexed = 0;
    for (let batch = 0; batch < DOCS_INDEX_BATCHES_PER_STEP; batch += 1) {
      const pending = await this.repo.pendingEmbeddings(
        corpus.buildHash,
        WIKI_EMBEDDING_MODEL,
        WIKI_EMBEDDING_BATCH_SIZE,
      );
      if (pending.length === 0) return { indexed, remaining: false };
      const texts = pending.map((chunk) => retrievalChunkText(chunk.label, chunk.body));
      const reservationId = await this.usage.reservePlatformRetrieval({
        purpose: "docsIndexing",
        model: WIKI_EMBEDDING_MODEL,
        worstCaseMicrocents: wikiEmbeddingWorstCaseMicrocents(texts),
      });
      if (!reservationId) return { indexed, remaining: false };
      let attemptedCharge = wikiEmbeddingAttemptCharge(texts);
      let embedded: Awaited<ReturnType<typeof embedWikiTexts>>;
      try {
        embedded = await embedWikiTexts(texts, "document", {
          maxRetries: 0,
          onCharge: (charge) => {
            attemptedCharge = charge;
          },
        });
      } catch (error) {
        await this.usage.settlePlatformRetrieval({ reservationId, charge: attemptedCharge });
        throw error;
      }
      const { vectors, charge } = embedded;
      await this.usage.settlePlatformRetrieval({ reservationId, charge });
      await this.repo.storeEmbeddings(
        WIKI_EMBEDDING_MODEL,
        pending.map((chunk, index) => ({
          contentHash: chunk.contentHash,
          embedding: vectorLiteral(vectors[index]),
        })),
      );
      indexed += pending.length;
    }
    return { indexed, remaining: true };
  }
}
