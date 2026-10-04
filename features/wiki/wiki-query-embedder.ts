import type { QueryEmbeddingWait } from "@/core/retrieval/query-embedding-wait";

export abstract class WikiQueryEmbedder {
  abstract embedQuery(query: string, wait?: QueryEmbeddingWait): Promise<{ vector: number[]; model: string } | null>;
}
