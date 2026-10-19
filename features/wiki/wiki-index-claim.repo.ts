import type { WikiIndexClaim } from "@/ee/wiki-retrieval/wiki-semantic-index.service";

export abstract class WikiIndexClaimRepo {
  abstract claimStaleIndexPages(version: string, limit: number): Promise<WikiIndexClaim[]>;
  abstract storeSummary(args: {
    pageId: string;
    pageUpdatedAt: Date;
    summary: string | null;
    contentHash: string;
  }): Promise<boolean>;
  abstract releaseIndexClaims(pageIds: string[]): Promise<void>;
}
