import type { Validated } from "@/core/validation/validation.utils";
import type { PublicLinkSettingsRepo } from "./public-link-settings.repo";
import type { PublicLinkSettings, SetPublicLinksAllowedData } from "./public-link-settings.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";

import { PublicLinkSettingsSchema, SetPublicLinksAllowedSchema } from "./public-link-settings.schema";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class SetPublicLinksAllowedInteractor extends AuthenticatedInteractor<
  SetPublicLinksAllowedData,
  PublicLinkSettings
> {
  constructor(private readonly repo: PublicLinkSettingsRepo) {
    super();
  }

  @Write({ input: SetPublicLinksAllowedSchema, output: PublicLinkSettingsSchema })
  async invoke({ allowPublicLinks }: SetPublicLinksAllowedData): Validated<PublicLinkSettings> {
    await this.repo.setPublicLinksAllowed(allowPublicLinks);
    return {
      ok: true as const,
      data: { allowPublicLinks, activeLinkCount: await this.repo.countActivePublicLinks() },
    };
  }
}
