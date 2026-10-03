import type { QueryEmbeddingWait } from "@/core/retrieval/query-embedding-wait";
import type { WikiQueryEmbedder } from "@/features/wiki/wiki-query-embedder";
import type { WikiEmbeddingService } from "./wiki-embedding.service";

import * as Sentry from "@sentry/node";

import { UserAccessor } from "@/core/base/user-accessor";

import { WIKI_EMBEDDING_MODEL } from "./wiki-embedding-model";

const WIKI_QUERY_CACHE_SIZE = 500;
const queryVectors = new Map<string, number[]>();
const pendingVectors = new Map<
  string,
  { vector: Promise<number[] | null>; waits: (QueryEmbeddingWait | undefined)[] }
>();

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

function claimsAny(waits: readonly (QueryEmbeddingWait | undefined)[]) {
  return waits.map((wait) => wait?.claim() ?? true).includes(true);
}

export class WikiSemanticQueryEmbedder extends UserAccessor implements WikiQueryEmbedder {
  constructor(private embeddings: WikiEmbeddingService) {
    super();
  }

  async embedQuery(query: string, wait?: QueryEmbeddingWait): Promise<{ vector: number[]; model: string } | null> {
    const grant = await this.embeddings.authorizeQuery({ id: this.userId, companyId: this.companyId });
    if (!grant) return null;

    const text = query.normalize("NFC").replace(/\s+/gu, " ").trim();
    const key = `${this.companyId}\u0000${WIKI_EMBEDDING_MODEL}\u0000${text}`;
    const known = cached(key);
    if (known) return { vector: known, model: WIKI_EMBEDDING_MODEL };

    const joined = pendingVectors.get(key);
    if (joined) joined.waits.push(wait);
    const pending = joined ?? { waits: [wait], vector: Promise.resolve<number[] | null>(null) };
    if (!joined) {
      pending.vector = this.embeddings
        .embedTexts(grant, [text], "query", () => claimsAny(pending.waits))
        .then((vectors) => {
          const vector = vectors?.[0] ?? null;
          if (vector) remember(key, vector);
          return vector;
        })
        .catch((error: unknown) => {
          Sentry.captureException(error);
          return null;
        })
        .finally(() => pendingVectors.delete(key));
      pendingVectors.set(key, pending);
    }
    const vector = await pending.vector;
    return vector ? { vector, model: WIKI_EMBEDDING_MODEL } : null;
  }
}
