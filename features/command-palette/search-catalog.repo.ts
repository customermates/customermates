import type { SearchCatalogText, StaticSearchCatalog } from "./search-catalog-corpus";

export type SearchCatalogScope = { companyId: string } | { buildHash: string };
export type SearchCatalogMatch = { targetId: string; similarity: number };

export abstract class SearchCatalogRepo {
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract ensureStaticCatalogUnscoped(catalog: StaticSearchCatalog): Promise<void>;
  abstract replaceWorkspaceCatalog(companyId: string, entries: readonly SearchCatalogText[]): Promise<void>;
  abstract claimPendingEmbeddingsUnscoped(
    scope: SearchCatalogScope,
    model: string,
    limit: number,
  ): Promise<SearchCatalogText[]>;
  abstract releaseClaimsUnscoped(scope: SearchCatalogScope, contentHashes: readonly string[]): Promise<void>;
  abstract storeEmbeddingsUnscoped(
    scope: SearchCatalogScope,
    model: string,
    rows: ReadonlyArray<{ contentHash: string; embedding: string }>,
  ): Promise<void>;
  abstract semanticMatchesUnscoped(args: {
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
