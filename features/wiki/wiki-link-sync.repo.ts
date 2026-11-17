export type WikiLinkSyncCandidate = { id: string; updatedAt: Date; linksSyncedAt: Date | null };

export type WikiLinkSyncPage = { id: string; markdown: string; updatedAt: Date };

export abstract class WikiLinkSyncRepo {
  abstract listLinkSyncCandidates(): Promise<WikiLinkSyncCandidate[]>;
  abstract loadPagesForLinkSync(ids: string[]): Promise<WikiLinkSyncPage[]>;
  abstract markLinksSynced(pageId: string, pageUpdatedAt: Date): Promise<boolean>;
}
