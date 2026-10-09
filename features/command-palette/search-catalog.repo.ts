import type { SearchCatalogText, StaticSearchCatalog } from "./search-catalog-corpus";

export type SearchCatalogScope = { companyId: string } | { buildHash: string };
export type SearchCatalogMatch = { targetId: string; similarity: number };

export abstract class SearchCatalogRepo {
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract ensureStaticCatalog(catalog: StaticSearchCatalog): Promise<void>;
  abstract replaceWorkspaceCatalog(companyId: string, entries: readonly SearchCatalogText[]): Promise<void>;
  abstract pendingEmbeddings(scope: SearchCatalogScope, model: string, limit: number): Promise<SearchCatalogText[]>;
  abstract storeEmbeddings(
    scope: SearchCatalogScope,
    model: string,
    rows: ReadonlyArray<{ contentHash: string; embedding: string }>,
  ): Promise<void>;
  abstract withIndexingLock(scope: SearchCatalogScope, run: () => Promise<boolean>): Promise<boolean>;
  abstract semanticMatches(args: {
    companyId: string;
    buildHash: string;
    locale: string;
    targetIds: readonly string[];
    vector: number[];
    model: string;
    minSimilarity: number;
    limit: number;
  }): Promise<SearchCatalogMatch[]>;
}
