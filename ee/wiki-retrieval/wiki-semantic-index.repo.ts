import type { WikiSemanticChunk } from "@/features/wiki/wiki-chunks";
import type { WikiSemanticIndexPage } from "./wiki-semantic-index.service";

export abstract class WikiSemanticIndexRepo {
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract claimStaleSemanticPages(model: string, limit: number): Promise<WikiSemanticIndexPage[]>;
  abstract semanticEmbeddingsByHash(pageId: string, model: string): Promise<Map<string, string>>;
  abstract replaceSemanticChunks(args: {
    pageId: string;
    pageUpdatedAt: Date;
    model: string;
    chunks: Array<WikiSemanticChunk & { embedding: string }>;
  }): Promise<boolean>;
  abstract releaseSemanticClaims(pageIds: string[]): Promise<void>;
}
