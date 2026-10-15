import type { WikiSemanticIndexRepo } from "./wiki-semantic-index.repo";
import type { WikiEmbeddingService } from "./wiki-embedding.service";
import type { WikiSummaryService } from "./wiki-summary.service";
import type { WikiSummaryState } from "@/features/wiki/wiki-summary";

import { UserAccessor } from "@/core/base/user-accessor";
import { WIKI_SECTION_MAX_EMBEDDED_ROWS, wikiContentHash, wikiSectionRows } from "@/features/wiki/wiki-sections";
import { currentWikiSummary, wikiSummaryNeeded } from "@/features/wiki/wiki-summary";

import { embeddingVectorLiteral, WIKI_EMBEDDING_BATCH_SIZE, WIKI_EMBEDDING_VERSION } from "./wiki-embedding-model";

export const WIKI_SEMANTIC_INDEX_BATCH_PAGES = 8;
export const WIKI_SECTION_SYNC_BATCH_PAGES = 200;

export type WikiIndexPage = WikiSummaryState & { id: string };

export class WikiSemanticIndexService extends UserAccessor {
  constructor(
    private repo: WikiSemanticIndexRepo,
    private embeddings: WikiEmbeddingService,
    private summaries: Pick<WikiSummaryService, "summarize">,
  ) {
    super();
  }

  async syncStaleSections(): Promise<{ synced: number; remaining: boolean }> {
    return this.repo.syncStaleSections(WIKI_SECTION_SYNC_BATCH_PAGES);
  }

  async indexStalePages(): Promise<{ indexed: number; remaining: boolean }> {
    if (!(await this.repo.semanticIndexAvailable()) || !(await this.embeddings.authorizeIndexing(this.companyId)))
      return { indexed: 0, remaining: false };

    const pages = await this.repo.claimStaleIndexPages(WIKI_EMBEDDING_VERSION, WIKI_SEMANTIC_INDEX_BATCH_PAGES);
    let indexed = 0;
    try {
      for (const page of pages) {
        const grant = await this.embeddings.authorizeIndexing(this.companyId);
        if (!grant) return { indexed, remaining: false };

        let summary = currentWikiSummary(page);
        if (wikiSummaryNeeded(page)) {
          const generated = await this.summaries.summarize(grant, page);
          if (generated.status === "unavailable") return { indexed, remaining: false };
          summary = generated.status === "generated" ? generated.summary : null;
          const stored = await this.repo.storeSummary({
            pageId: page.id,
            pageUpdatedAt: page.updatedAt,
            summary,
            contentHash: wikiContentHash(page),
          });
          if (!stored) continue;
        }

        const rows = wikiSectionRows(page, summary);
        const known = await this.repo.sectionEmbeddingsByHash(page.id, WIKI_EMBEDDING_VERSION);
        const missing = [
          ...new Map(
            rows
              .filter((row) => row.ordinal < WIKI_SECTION_MAX_EMBEDDED_ROWS && !known.has(row.contentHash))
              .map((row) => [row.contentHash, row]),
          ).values(),
        ];
        for (let start = 0; start < missing.length; start += WIKI_EMBEDDING_BATCH_SIZE) {
          const batch = missing.slice(start, start + WIKI_EMBEDDING_BATCH_SIZE);
          const vectors = await this.embeddings.embedTexts(
            grant,
            batch.map((row) => row.embeddingText),
            "document",
          );
          if (!vectors) return { indexed, remaining: false };
          batch.forEach((row, index) => known.set(row.contentHash, embeddingVectorLiteral(vectors[index])));
        }

        const written = await this.repo.replaceSections({
          pageId: page.id,
          pageUpdatedAt: page.updatedAt,
          pageTitle: page.title,
          summary,
          rows,
          embeddings: known,
          version: WIKI_EMBEDDING_VERSION,
          onlyIfStale: false,
        });
        if (written) indexed += 1;
      }
    } finally {
      await this.repo.releaseIndexClaims(pages.map((page) => page.id));
    }
    return {
      indexed,
      remaining: pages.length === WIKI_SEMANTIC_INDEX_BATCH_PAGES,
    };
  }
}
