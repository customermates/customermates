export const WIKI_KNOWLEDGE_GAP_QUERY_MAX_LENGTH = 200;
export const WIKI_KNOWLEDGE_GAP_RETENTION_DAYS = 90;
export const WIKI_KNOWLEDGE_GAP_LIST_SIZE = 20;

export function wikiKnowledgeGapQuery(query: string): string | null {
  const shape = query
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
  if (!shape) return null;
  return Array.from(shape).slice(0, WIKI_KNOWLEDGE_GAP_QUERY_MAX_LENGTH).join("").trimEnd();
}
