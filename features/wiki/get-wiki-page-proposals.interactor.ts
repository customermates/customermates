import type { GetWikiPageProposalsRepo } from "./get-wiki-page-proposals.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageProposalReviewList } from "./wiki-page-proposal.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { WIKI_PAGE_PROPOSAL_REVIEW_LIMIT, WikiPageProposalReviewListSchema } from "./wiki-page-proposal.schema";

@TenantInteractor({ resource: Resource.wiki, manage: "update" })
export class GetWikiPageProposalsInteractor extends AuthenticatedInteractor<void, WikiPageProposalReviewList> {
  constructor(private repo: GetWikiPageProposalsRepo) {
    super();
  }

  @ValidateOutput(WikiPageProposalReviewListSchema)
  async invoke(): Validated<WikiPageProposalReviewList> {
    return { ok: true as const, data: await this.repo.listPendingProposals(WIKI_PAGE_PROPOSAL_REVIEW_LIMIT) };
  }
}
