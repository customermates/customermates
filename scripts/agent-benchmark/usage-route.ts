import { WIKI_EMBEDDING_MODEL } from "@/ee/wiki-retrieval/wiki-embedding-model";

export function isRetrievalUsage(event: { model: string; purpose?: string }) {
  return (event.purpose !== undefined && event.purpose !== "turn") || event.model === WIKI_EMBEDDING_MODEL;
}

export function usageFollowsRoute(usage: readonly { model: string; purpose?: string }[], modelId: string) {
  return usage.every((event) => isRetrievalUsage(event) || event.model === modelId);
}
