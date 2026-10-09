import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { CommandCatalogRepo } from "@/features/command-palette/command-catalog.repo";
import type { SearchCatalogRepo, SearchCatalogScope } from "@/features/command-palette/search-catalog.repo";
import type { SearchCatalogText } from "@/features/command-palette/search-catalog-corpus";
import type { RecordRepo } from "@/features/records/record.repo";
import type { WikiEmbeddingService } from "./wiki-embedding.service";

import { UserAccessor } from "@/core/base/user-accessor";
import { staticSearchCatalog, workspaceSearchCatalog } from "@/features/command-palette/search-catalog-corpus";

import { isWikiSemanticSearchAvailable } from "./wiki-embedding.service";
import {
  embedWikiTexts,
  WIKI_EMBEDDING_BATCH_SIZE,
  WIKI_EMBEDDING_MODEL,
  wikiEmbeddingAttemptCharge,
  wikiEmbeddingWorstCaseMicrocents,
} from "./wiki-embedding-model";

const SEARCH_CATALOG_BATCHES_PER_STEP = 8;

function vectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}

export class SearchCatalogIndexService extends UserAccessor {
  constructor(
    private repo: SearchCatalogRepo,
    private records: RecordRepo,
    private views: CommandCatalogRepo,
    private embeddings: WikiEmbeddingService,
    private usage: AgentUsageService,
  ) {
    super();
  }

  async indexPending(): Promise<{ remaining: boolean }> {
    const catalog = await staticSearchCatalog();
    await this.repo.ensureStaticCatalog(catalog);
    const [model, views] = await Promise.all([this.records.getModel(), this.views.listWorkspaceRecordViewNames()]);
    await this.repo.replaceWorkspaceCatalog(this.companyId, workspaceSearchCatalog(model, views));
    if (!isWikiSemanticSearchAvailable() || !(await this.repo.semanticIndexAvailable())) return { remaining: false };
    const staticRemaining = await this.embedStatic({ buildHash: catalog.buildHash });
    const workspaceRemaining = await this.embedWorkspace({ companyId: this.companyId });
    return { remaining: staticRemaining || workspaceRemaining };
  }

  private async pendingBatches(
    scope: SearchCatalogScope,
    embedBatch: (texts: string[]) => Promise<number[][] | null>,
  ): Promise<boolean> {
    for (let batch = 0; batch < SEARCH_CATALOG_BATCHES_PER_STEP; batch += 1) {
      const pending: SearchCatalogText[] = await this.repo.pendingEmbeddings(
        scope,
        WIKI_EMBEDDING_MODEL,
        WIKI_EMBEDDING_BATCH_SIZE,
      );
      if (pending.length === 0) return false;
      const vectors = await embedBatch(pending.map((entry) => entry.text));
      if (!vectors) return false;
      await this.repo.storeEmbeddings(
        scope,
        WIKI_EMBEDDING_MODEL,
        pending.map((entry, index) => ({ contentHash: entry.contentHash, embedding: vectorLiteral(vectors[index]) })),
      );
    }
    return true;
  }

  private embedStatic(scope: SearchCatalogScope): Promise<boolean> {
    return this.pendingBatches(scope, async (texts) => {
      if (!(await this.usage.admitsPlatformRetrieval())) return null;
      const reservationId = await this.usage.reservePlatformRetrieval({
        purpose: "commandCatalogIndexing",
        model: WIKI_EMBEDDING_MODEL,
        worstCaseMicrocents: wikiEmbeddingWorstCaseMicrocents(texts),
      });
      if (!reservationId) return null;
      let attemptedCharge = wikiEmbeddingAttemptCharge(texts);
      try {
        const { vectors, charge } = await embedWikiTexts(texts, "document", {
          maxRetries: 0,
          onCharge: (measured) => {
            attemptedCharge = measured;
          },
        });
        attemptedCharge = charge;
        return vectors;
      } finally {
        await this.usage.settlePlatformRetrieval({ reservationId, charge: attemptedCharge });
      }
    });
  }

  private embedWorkspace(scope: SearchCatalogScope): Promise<boolean> {
    return this.pendingBatches(scope, async (texts) => {
      const grant = await this.embeddings.authorizeIndexing(this.companyId);
      return grant ? this.embeddings.embedTexts(grant, texts, "document") : null;
    });
  }
}
