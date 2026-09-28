import type { Validated } from "@/core/validation/validation.utils";
import type { WikiPageListData, WikiPageListResult } from "./wiki.schema";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { WikiPageListResultSchema, WikiPageListSchema } from "./wiki.schema";

export abstract class GetWikiPagesRepo {
  abstract listPages(data: WikiPageListData): Promise<WikiPageListResult>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class GetWikiPagesInteractor extends AuthenticatedInteractor<WikiPageListData, WikiPageListResult> {
  constructor(private repo: GetWikiPagesRepo) {
    super();
  }

  @Validate(WikiPageListSchema)
  @ValidateOutput(WikiPageListResultSchema)
  async invoke(data: WikiPageListData): Validated<WikiPageListResult> {
    return { ok: true as const, data: await this.repo.listPages(data) };
  }
}
