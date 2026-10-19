export abstract class PurgeWikiPageProposalsRepo {
  abstract deleteProposalsOfPages(pageIds: string[]): Promise<void>;
}
