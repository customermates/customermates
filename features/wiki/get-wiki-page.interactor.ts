import type { GetWikiPageRepo } from "./get-wiki-page.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { WikiPageDto } from "./wiki.schema";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WikiPageDtoSchema } from "./wiki.schema";

export const GetWikiPageSchema = z.object({ id: z.uuid() });
type GetWikiPageData = Data<typeof GetWikiPageSchema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class GetWikiPageInteractor extends AuthenticatedInteractor<GetWikiPageData, WikiPageDto> {
  constructor(private repo: GetWikiPageRepo) {
    super();
  }

  @Validate(GetWikiPageSchema)
  @ValidateOutput(WikiPageDtoSchema)
  async invoke(data: GetWikiPageData): Validated<WikiPageDto> {
    const page = await this.repo.getPage(data.id);
    if (!page) return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    return { ok: true as const, data: page };
  }
}
