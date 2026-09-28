import type { WikiQueryEmbedder } from "@/features/wiki/search-wiki-pages.interactor";
import type { WikiEmbeddingService } from "./wiki-embedding.service";

import * as Sentry from "@sentry/node";

import { UserAccessor } from "@/core/base/user-accessor";

import { WIKI_EMBEDDING_MODEL } from "./wiki-embedding-model";

const WIKI_QUERY_CACHE_SIZE = 500;
const queryVectors = new Map<string, number[]>();

function cached(key: string): number[] | undefined {
  const vector = queryVectors.get(key);
  if (!vector) return undefined;
  queryVectors.delete(key);
  queryVectors.set(key, vector);
  return vector;
}

function remember(key: string, vector: number[]) {
  queryVectors.set(key, vector);
  const oldest = queryVectors.keys().next().value;
  if (queryVectors.size > WIKI_QUERY_CACHE_SIZE && oldest !== undefined) queryVectors.delete(oldest);
}

export class WikiSemanticQueryEmbedder extends UserAccessor implements WikiQueryEmbedder {
  constructor(private embeddings: WikiEmbeddingService) {
    super();
  }

  async embedQuery(query: string): Promise<{ vector: number[]; model: string } | null> {
    const payer = { id: this.userId, companyId: this.companyId };
    const grant = await this.embeddings.authorize(payer);
    if (!grant) return null;

    const text = query.normalize("NFC").replace(/\s+/gu, " ").trim();
    const key = `${WIKI_EMBEDDING_MODEL}\u0000${text}`;
    const known = cached(key);
    if (known) return { vector: known, model: WIKI_EMBEDDING_MODEL };

    try {
      const [vector] = await this.embeddings.embedTexts(payer, grant, [text], "query");
      remember(key, vector);
      return { vector, model: WIKI_EMBEDDING_MODEL };
    } catch (error) {
      Sentry.captureException(error);
      return null;
    }
  }
}
