import type { WikiPageProposalReviewList } from "./wiki-page-proposal.schema";

export abstract class GetWikiPageProposalsRepo {
  abstract listPendingProposals(limit: number): Promise<WikiPageProposalReviewList>;
}
