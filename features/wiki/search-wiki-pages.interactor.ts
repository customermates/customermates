import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import type { Validated } from "@/core/validation/validation.utils";

import {
  WikiPageSearchResultSchema,
  WikiPageSearchSchema,
  type WikiPageSearchData,
  type WikiPageSearchPage,
} from "./wiki.schema";

export abstract class SearchWikiPagesRepo {
  abstract searchPages(data: WikiPageSearchData): Promise<WikiPageSearchPage>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class SearchWikiPagesInteractor extends AuthenticatedInteractor<WikiPageSearchData, WikiPageSearchPage> {
  constructor(private repo: SearchWikiPagesRepo) {
    super();
  }

  @Validate(WikiPageSearchSchema)
  @ValidateOutput(WikiPageSearchResultSchema)
  async invoke(data: WikiPageSearchData): Validated<WikiPageSearchPage> {
    return { ok: true, data: await this.repo.searchPages(data) };
  }
}
