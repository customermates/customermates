import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { MessagingFilterOptions } from "./messaging-filter-options.schema";

import { Resource, Action } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { MessagingFilterOptionsSchema } from "./messaging-filter-options.schema";
import type { MessagingFilterOptionsRepo } from "./messaging-filter-options.repo";

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMessagingFilterOptionsInteractor extends AuthenticatedInteractor<void, MessagingFilterOptions> {
  constructor(
    private repo: MessagingFilterOptionsRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @ValidateOutput(MessagingFilterOptionsSchema)
  async invoke(): Validated<MessagingFilterOptions> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;
    return { ok: true as const, data: await this.repo.listInboxFilterOptions() };
  }
}
