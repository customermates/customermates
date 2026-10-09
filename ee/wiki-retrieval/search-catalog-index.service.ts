import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { CommandCatalogRepo } from "@/features/command-palette/command-catalog.repo";
import type { SearchCatalogRepo, SearchCatalogScope } from "@/features/command-palette/search-catalog.repo";
import type { RecordRepo } from "@/features/records/record.repo";
import type { WikiEmbeddingService } from "./wiki-embedding.service";

import { UserAccessor } from "@/core/base/user-accessor";
import { staticSearchCatalog, workspaceSearchCatalog } from "@/features/command-palette/search-catalog-corpus";

import { embedPlatformTexts, isWikiSemanticSearchAvailable } from "./wiki-embedding.service";
import { embeddingVectorLiteral, WIKI_EMBEDDING_BATCH_SIZE, WIKI_EMBEDDING_MODEL } from "./wiki-embedding-model";

const SEARCH_CATALOG_BATCHES_PER_STEP = 8;

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
    const staticRemaining = await this.embedPending({ buildHash: catalog.buildHash }, async (texts) =>
      (await this.usage.admitsPlatformRetrieval())
        ? embedPlatformTexts(this.usage, "commandCatalogIndexing", texts)
        : null,
    );
    const workspaceRemaining = await this.embedPending({ companyId: this.companyId }, async (texts) => {
      const grant = await this.embeddings.authorizeIndexing(this.companyId);
      return grant ? this.embeddings.embedTexts(grant, texts, "document") : null;
    });
    return { remaining: staticRemaining || workspaceRemaining };
  }

  private embedPending(
    scope: SearchCatalogScope,
    embedBatch: (texts: string[]) => Promise<number[][] | null>,
  ): Promise<boolean> {
    return this.repo.withIndexingLock(scope, async () => {
      for (let batch = 0; batch < SEARCH_CATALOG_BATCHES_PER_STEP; batch += 1) {
        const pending = await this.repo.pendingEmbeddings(scope, WIKI_EMBEDDING_MODEL, WIKI_EMBEDDING_BATCH_SIZE);
        if (pending.length === 0) return false;
        const vectors = await embedBatch(pending.map((entry) => entry.text));
        if (!vectors) return false;
        await this.repo.storeEmbeddings(
          scope,
          WIKI_EMBEDDING_MODEL,
          pending.map((entry, index) => ({
            contentHash: entry.contentHash,
            embedding: embeddingVectorLiteral(vectors[index]),
          })),
        );
      }
      return true;
    });
  }
}
