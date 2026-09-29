import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { DocsChunkRepo } from "@/features/mcp-tools/prisma-docs-chunk.repository";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";

import * as Sentry from "@sentry/node";

import { retrievalChunkText } from "@/core/retrieval/retrieval-chunks";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";

import { isWikiSemanticSearchAvailable } from "./wiki-embedding.service";
import {
  embedWikiTexts,
  WIKI_EMBEDDING_BATCH_SIZE,
  WIKI_EMBEDDING_MODEL,
  wikiEmbeddingWorstCaseMicrocents,
} from "./wiki-embedding-model";

const DOCS_INDEX_BATCHES_PER_STEP = 8;
const DOCS_INDEX_SCHEDULE_INTERVAL_MS = 60_000;
let lastSchedule = 0;

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
      const { vectors, charge } = await embedWikiTexts(texts, "document", {
        maxRetries: 0,
      });
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

export class DocsSemanticIndexDispatcher {
  constructor(
    private repo: DocsChunkRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  async schedule(buildHash: string, seeded: boolean): Promise<void> {
    const now = Date.now();
    if (now - lastSchedule < DOCS_INDEX_SCHEDULE_INTERVAL_MS) return;
    lastSchedule = now;
    try {
      if (seeded) {
        if (!isWikiSemanticSearchAvailable() || !(await this.repo.semanticIndexAvailable())) return;
        if ((await this.repo.pendingEmbeddings(buildHash, WIKI_EMBEDDING_MODEL, 1)).length === 0) return;
      }
      await this.backgroundTaskService.dispatch("index-docs-chunks", {});
    } catch (error) {
      Sentry.captureException(error);
    }
  }
}
