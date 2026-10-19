import type { QueryEmbeddingWait } from "@/core/retrieval/query-embedding-wait";
import type { QueryVector } from "@/core/retrieval/retrieval-pipeline";

export abstract class WikiQueryEmbedder {
  abstract embedQuery(query: string, wait?: QueryEmbeddingWait): Promise<QueryVector | null>;
}
