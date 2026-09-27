import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import type { Validated } from "@/core/validation/validation.utils";

import type { StartWikiHomepageSetupRepo } from "./start-wiki-homepage-setup.interactor";

@TenantInteractor({ resource: Resource.wiki, action: Action.create })
export class GetWikiWebsiteSetupAvailabilityInteractor extends AuthenticatedInteractor<undefined, boolean> {
  constructor(private repo: StartWikiHomepageSetupRepo) {
    super();
  }

  async invoke(): Validated<boolean> {
    return { ok: true, data: await this.repo.wikiIsEmpty() };
  }
}
