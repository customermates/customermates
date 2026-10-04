import type { WikiPageDto } from "./wiki.schema";
import type { WikiSemanticCandidate, WikiFullTextCandidates } from "./search-wiki-pages.interactor";

export abstract class SearchWikiPagesRepo {
  abstract semanticPageCandidates(
    vector: number[],
    model: string,
    limit: number,
  ): Promise<{ candidates: WikiSemanticCandidate[]; stalePageIds: Set<string> } | null>;
  abstract getPagesByIds(ids: string[]): Promise<WikiPageDto[]>;
  abstract fullTextPageCandidates(query: string, limit: number): Promise<WikiFullTextCandidates>;
  abstract rankPageSections(
    query: string,
    sections: Array<{ key: number; heading: string; body: string }>,
  ): Promise<Map<number, number>>;
  abstract sectionHeadlines(query: string, bodies: string[]): Promise<string[]>;
}
