export type WikiImportedPageRecord = {
  id: string;
  updatedAt: Date;
  sourceFetchedAt: Date | null;
  sourceContentHash: string | null;
  sourceImportedUpdatedAt: Date | null;
};

export type WikiImportProvenance = {
  url: string;
  fetchedAt: Date;
  contentHash: string;
  importedUpdatedAt: Date;
};

export abstract class WikiImportPageRepo {
  abstract listRefreshTargets(): Promise<Array<{ url: string; category: "help" }>>;
  abstract countImportedPages(since: Date): Promise<number>;
  abstract findImportedPage(sourceUrl: string): Promise<WikiImportedPageRecord | null>;
  abstract countSynthesizedPages(since: Date): Promise<number>;
  abstract listSynthesizedPages(since: Date, limit: number): Promise<Array<{ id: string; title: string }>>;
  abstract markImported(pageId: string, source: WikiImportProvenance): Promise<boolean>;
}
