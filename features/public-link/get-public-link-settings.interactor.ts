import type { Validated } from "@/core/validation/validation.utils";
import type { PublicLinkSettingsRepo } from "./public-link-settings.repo";
import type { PublicLinkSettings } from "./public-link-settings.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { PublicLinkSettingsSchema } from "./public-link-settings.schema";

@TenantInteractor()
export class GetPublicLinkSettingsInteractor extends AuthenticatedInteractor<void, PublicLinkSettings> {
  constructor(private readonly repo: PublicLinkSettingsRepo) {
    super();
  }

  @ValidateOutput(PublicLinkSettingsSchema)
  async invoke(): Validated<PublicLinkSettings> {
    const [allowPublicLinks, activeLinkCount] = await Promise.all([
      this.repo.publicLinksAllowedForCompany(),
      this.repo.countActivePublicLinks(),
    ]);
    return { ok: true as const, data: { allowPublicLinks, activeLinkCount } };
  }
}
