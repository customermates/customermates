import type { WikiSectionRow } from "@/features/wiki/wiki-sections";
import type { WikiIndexPage } from "./wiki-semantic-index.service";

export abstract class WikiSemanticIndexRepo {
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract claimStaleIndexPages(version: string, limit: number): Promise<WikiIndexPage[]>;
  abstract sectionEmbeddingsByHash(pageId: string, version: string): Promise<Map<string, string>>;
  abstract storeSummary(args: {
    pageId: string;
    pageUpdatedAt: Date;
    summary: string | null;
    contentHash: string;
  }): Promise<boolean>;
  abstract replaceSections(args: {
    pageId: string;
    pageUpdatedAt: Date;
    pageTitle: string;
    summary: string | null;
    rows: WikiSectionRow[];
    embeddings: ReadonlyMap<string, string>;
    version: string | null;
    onlyIfStale: boolean;
  }): Promise<boolean>;
  abstract releaseIndexClaims(pageIds: string[]): Promise<void>;
  abstract hasStaleIndexPages(version: string): Promise<boolean>;
  abstract claimIndexSchedule(intervalSeconds: number): Promise<boolean>;
}
