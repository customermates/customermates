import type { WikiPageDto } from "./wiki.schema";

export type WikiSectionMatch = { pageId: string; sectionId: string };
export type WikiFullTextSections = {
  hits: Array<WikiSectionMatch & { coverage: number }>;
  pinned: WikiSectionMatch[];
  coverage: number;
  corrected?: string;
};
export type WikiSemanticSections = {
  hits: Array<WikiSectionMatch & { similarity: number }>;
  complete: boolean;
  stale: boolean;
};
export type WikiSectionHit = {
  id: string;
  pageId: string;
  offset: number;
  headingPath: string[];
  anchor: string;
  text: string;
};

export abstract class SearchWikiPagesRepo {
  abstract syncStaleSections(): Promise<number>;
  abstract fullTextSections(query: string, limit: number): Promise<WikiFullTextSections>;
  abstract semanticSections(vector: number[], version: string, limit: number): Promise<WikiSemanticSections | null>;
  abstract getSectionsByIds(ids: string[]): Promise<WikiSectionHit[]>;
  abstract getPagesByIds(ids: string[]): Promise<WikiPageDto[]>;
}
