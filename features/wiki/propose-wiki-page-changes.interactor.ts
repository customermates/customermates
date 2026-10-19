import type { ProposeWikiPageChangesRepo } from "./propose-wiki-page-changes.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { ProposeWikiPageChangesData, WikiPageProposalDto } from "./wiki-page-proposal.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { canApplyWikiProposalAction } from "./wiki-page-proposal-permissions";
import { ProposeWikiPageChangesSchema, WikiPageProposalDtoSchema } from "./wiki-page-proposal.schema";

export type { ProposeWikiPageChangesData } from "./wiki-page-proposal.schema";

export type ProposeWikiPageChangesRepoResult =
  | { status: "proposed"; proposals: WikiPageProposalDto[] }
  | { status: "not-found" }
  | { status: "conflict" }
  | { status: "guide-exists" }
  | { status: "invalid"; error: CustomErrorCode };

@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class ProposeWikiPageChangesInteractor extends AuthenticatedInteractor<
  ProposeWikiPageChangesData,
  WikiPageProposalDto[]
> {
  constructor(private repo: ProposeWikiPageChangesRepo) {
    super();
  }

  @Write({ input: ProposeWikiPageChangesSchema, output: WikiPageProposalDtoSchema })
  async invoke(data: ProposeWikiPageChangesData): Validated<WikiPageProposalDto[]> {
    if (!canApplyWikiProposalAction(this.user, data.action)) return failAuthorization(CustomErrorCode.permissionDenied);

    const result = await this.repo.proposeChanges(data);
    if (result.status === "not-found") return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    if (result.status === "conflict") return failConflict(CustomErrorCode.wikiPageConflict, ["expectedUpdatedAt"]);
    if (result.status === "guide-exists")
      return failConflict(CustomErrorCode.wikiGuideExists, [data.action === "create" ? "pages" : "kind"]);
    if (result.status === "invalid")
      return fail(result.error, [result.error === CustomErrorCode.wikiWhenToUseRequired ? "whenToUse" : "markdown"]);

    return { ok: true as const, data: result.proposals };
  }
}
