import type { WikiSemanticChunk } from "@/features/wiki/wiki-chunks";
import type { WikiEmbeddingService } from "./wiki-embedding.service";

import { UserAccessor } from "@/core/base/user-accessor";
import { wikiSemanticChunks } from "@/features/wiki/wiki-chunks";

import { WIKI_EMBEDDING_BATCH_SIZE, WIKI_EMBEDDING_MODEL } from "./wiki-embedding-model";

export const WIKI_SEMANTIC_INDEX_BATCH_PAGES = 8;

export type WikiSemanticIndexPage = { id: string; title: string; markdown: string; updatedAt: Date };

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

function vectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}

export class WikiSemanticIndexService extends UserAccessor {
  constructor(
    private repo: WikiSemanticIndexRepo,
    private embeddings: WikiEmbeddingService,
  ) {
    super();
  }

  async indexStalePages(): Promise<{ indexed: number; remaining: boolean }> {
    if (!(await this.repo.semanticIndexAvailable()) || !(await this.embeddings.authorizeIndexing(this.companyId)))
      return { indexed: 0, remaining: false };

    const pages = await this.repo.claimStaleSemanticPages(WIKI_EMBEDDING_MODEL, WIKI_SEMANTIC_INDEX_BATCH_PAGES);
    let indexed = 0;
    try {
      for (const page of pages) {
        const grant = await this.embeddings.authorizeIndexing(this.companyId);
        if (!grant) return { indexed, remaining: false };

        const chunks = wikiSemanticChunks(page.title, page.markdown);
        const known = await this.repo.semanticEmbeddingsByHash(page.id, WIKI_EMBEDDING_MODEL);
        const missing = [
          ...new Map(
            chunks.filter((chunk) => !known.has(chunk.contentHash)).map((chunk) => [chunk.contentHash, chunk]),
          ).values(),
        ];
        for (let start = 0; start < missing.length; start += WIKI_EMBEDDING_BATCH_SIZE) {
          const batch = missing.slice(start, start + WIKI_EMBEDDING_BATCH_SIZE);
          const vectors = await this.embeddings.embedTexts(
            grant,
            batch.map((chunk) => chunk.text),
            "document",
          );
          batch.forEach((chunk, index) => known.set(chunk.contentHash, vectorLiteral(vectors[index])));
        }

        const written = await this.repo.replaceSemanticChunks({
          pageId: page.id,
          pageUpdatedAt: page.updatedAt,
          model: WIKI_EMBEDDING_MODEL,
          chunks: chunks.flatMap((chunk) => {
            const embedding = known.get(chunk.contentHash);
            return embedding ? [{ ...chunk, embedding }] : [];
          }),
        });
        if (written) indexed += 1;
      }
    } finally {
      await this.repo.releaseSemanticClaims(pages.map((page) => page.id));
    }
    return { indexed, remaining: pages.length === WIKI_SEMANTIC_INDEX_BATCH_PAGES };
  }
}
