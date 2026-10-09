import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";

import { docsPendingEmbeddingTexts } from "@/features/mcp-tools/docs-embedding-input";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";

import { embedPlatformTexts, isWikiSemanticSearchAvailable } from "./wiki-embedding.service";
import { embeddingVectorLiteral, WIKI_EMBEDDING_BATCH_SIZE, WIKI_EMBEDDING_MODEL } from "./wiki-embedding-model";

const DOCS_INDEX_BATCHES_PER_STEP = 8;

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
      const texts = docsPendingEmbeddingTexts(corpus, pending);
      const vectors = await embedPlatformTexts(this.usage, "docsIndexing", texts);
      if (!vectors) return { indexed, remaining: false };
      await this.repo.storeEmbeddings(
        WIKI_EMBEDDING_MODEL,
        pending.map((chunk, index) => ({
          contentHash: chunk.contentHash,
          embedding: embeddingVectorLiteral(vectors[index]),
        })),
      );
      indexed += pending.length;
    }
    return { indexed, remaining: true };
  }
}
