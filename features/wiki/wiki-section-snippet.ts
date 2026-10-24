import { retrievalExcerpt } from "@/core/retrieval/retrieval-excerpt";

import { WIKI_EXCERPT_MAX_LENGTH, wikiExcerpt } from "./wiki-content";

export function wikiSectionSnippet(text: string, query: string): string {
  const excerpt = retrievalExcerpt({ heading: "", markdown: text, query, maxChars: WIKI_EXCERPT_MAX_LENGTH });
  const compact = excerpt.replace(/\s+/gu, " ").trim();
  return compact || (text ? wikiExcerpt(text) : "");
}
