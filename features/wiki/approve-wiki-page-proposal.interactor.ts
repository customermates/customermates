import type { ReviewWikiPageProposalRepo } from "./review-wiki-page-proposal.repo";
import type { CreateWikiPagesInteractor } from "./create-wiki-pages.interactor";
import type { UpdateWikiPageInteractor } from "./update-wiki-page.interactor";
import type { DeleteWikiPageInteractor } from "./delete-wiki-page.interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageDto } from "./wiki.schema";
import type { WikiPageProposalDto, WikiPageProposalIdData } from "./wiki-page-proposal.schema";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { canApplyWikiProposalAction } from "./wiki-page-proposal-permissions";
import { WikiPageProposalDtoSchema, WikiPageProposalIdSchema } from "./wiki-page-proposal.schema";

const STALE_PAGE_CODES = new Set<string>([CustomErrorCode.wikiPageConflict, CustomErrorCode.wikiPageNotFound]);

@TenantInteractor({ resource: Resource.wiki, action: Action.update })
export class ApproveWikiPageProposalInteractor extends AuthenticatedInteractor<
  WikiPageProposalIdData,
  WikiPageProposalDto
> {
  constructor(
    private repo: ReviewWikiPageProposalRepo,
    private createPages: CreateWikiPagesInteractor,
    private updatePage: UpdateWikiPageInteractor,
    private deletePage: DeleteWikiPageInteractor,
  ) {
    super();
  }

  @Write({ input: WikiPageProposalIdSchema, output: WikiPageProposalDtoSchema })
  async invoke(data: WikiPageProposalIdData): Validated<WikiPageProposalDto> {
    const proposal = await this.repo.findProposal(data.id);
    if (!proposal) return failNotFound(CustomErrorCode.wikiProposalNotFound, ["id"]);
    if (proposal.status !== "pending") return failConflict(CustomErrorCode.wikiProposalReviewed, ["id"]);
    if (!canApplyWikiProposalAction(this.user, proposal.action))
      return failAuthorization(CustomErrorCode.permissionDenied);

    const applied = await this.apply(proposal);
    if (!applied.ok) {
      const stale = interactorFailureCodes(applied.error).some((code) => STALE_PAGE_CODES.has(code));
      return stale ? failConflict(CustomErrorCode.wikiProposalStale, ["id"]) : applied;
    }

    const settled = await this.repo.settlePendingProposal({
      id: proposal.id,
      status: "approved",
      pageId: applied.data.id,
    });
    if (!settled) return failConflict(CustomErrorCode.wikiProposalReviewed, ["id"]);

    return { ok: true as const, data: settled };
  }

  private async apply(proposal: WikiPageProposalDto): Validated<WikiPageDto> {
    if (proposal.action === "create") {
      const created = await this.createPages.invoke({
        pages: [
          {
            title: proposal.title ?? "",
            markdown: proposal.markdown ?? "",
            kind: proposal.kind ?? undefined,
            whenToUse: proposal.whenToUse ?? undefined,
          },
        ],
        requireEmpty: false,
      });
      return created.ok ? { ok: true as const, data: created.data[0] } : created;
    }

    if (!proposal.pageId || !proposal.baseUpdatedAt) return failConflict(CustomErrorCode.wikiProposalStale, ["id"]);

    if (proposal.action === "delete")
      return this.deletePage.invoke({ id: proposal.pageId, expectedUpdatedAt: proposal.baseUpdatedAt });

    return this.updatePage.invoke({
      id: proposal.pageId,
      expectedUpdatedAt: proposal.baseUpdatedAt,
      title: proposal.title ?? undefined,
      markdown: proposal.markdown ?? undefined,
      kind: proposal.kind ?? undefined,
      whenToUse: proposal.whenToUse ?? undefined,
    });
  }
}
