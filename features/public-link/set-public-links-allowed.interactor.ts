import type { Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { PublicLinkSettingsRepo } from "./public-link-settings.repo";
import type { PublicLinkSettings, SetPublicLinksAllowedData } from "./public-link-settings.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { DomainEvent } from "@/features/event/domain-events";

import { PublicLinkSettingsSchema, SetPublicLinksAllowedSchema } from "./public-link-settings.schema";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class SetPublicLinksAllowedInteractor extends AuthenticatedInteractor<
  SetPublicLinksAllowedData,
  PublicLinkSettings
> {
  constructor(
    private readonly repo: PublicLinkSettingsRepo,
    private readonly events?: EventService,
  ) {
    super();
  }

  @Write({ input: SetPublicLinksAllowedSchema, output: PublicLinkSettingsSchema })
  async invoke({ allowPublicLinks }: SetPublicLinksAllowedData): Validated<PublicLinkSettings> {
    await this.repo.setPublicLinksAllowed(allowPublicLinks);
    const activeLinkCount = await this.repo.countActivePublicLinks();
    await this.events?.publish(allowPublicLinks ? DomainEvent.PUBLIC_LINKS_ALLOWED : DomainEvent.PUBLIC_LINKS_BLOCKED, {
      entityId: this.user.companyId,
      payload: { activeLinkCount },
    });
    return { ok: true as const, data: { allowPublicLinks, activeLinkCount } };
  }
}
