import type { ReviewWikiPageProposalRepo } from "./review-wiki-page-proposal.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageProposalDto, WikiPageProposalIdData } from "./wiki-page-proposal.schema";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WikiPageProposalDtoSchema, WikiPageProposalIdSchema } from "./wiki-page-proposal.schema";

@TenantInteractor({ resource: Resource.wiki, action: Action.update })
export class RejectWikiPageProposalInteractor extends AuthenticatedInteractor<
  WikiPageProposalIdData,
  WikiPageProposalDto
> {
  constructor(private repo: ReviewWikiPageProposalRepo) {
    super();
  }

  @Write({ input: WikiPageProposalIdSchema, output: WikiPageProposalDtoSchema })
  async invoke(data: WikiPageProposalIdData): Validated<WikiPageProposalDto> {
    const proposal = await this.repo.findProposal(data.id);
    if (!proposal) return failNotFound(CustomErrorCode.wikiProposalNotFound, ["id"]);

    const settled = await this.repo.settlePendingProposal({ id: proposal.id, status: "rejected" });
    if (!settled) return failConflict(CustomErrorCode.wikiProposalReviewed, ["id"]);

    return { ok: true as const, data: settled };
  }
}
