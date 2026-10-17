import type { WikiPageProposalDto } from "./wiki-page-proposal.schema";

export abstract class ReviewWikiPageProposalRepo {
  abstract findProposal(id: string): Promise<WikiPageProposalDto | null>;
  abstract settlePendingProposal(args: {
    id: string;
    status: "approved" | "rejected";
    pageId?: string;
  }): Promise<WikiPageProposalDto | null>;
}
