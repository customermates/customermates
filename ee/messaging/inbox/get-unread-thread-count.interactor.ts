import type { GetUnreadThreadCountRepo } from "./get-unread-thread-count.repo";
import { z } from "zod";
import { Resource } from "@/generated/prisma";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetUnreadThreadCountInteractor extends AuthenticatedInteractor<void, number> {
  constructor(
    private repo: GetUnreadThreadCountRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @ValidateOutput(z.number())
  async invoke() {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const count = await this.repo.countUnreadThreadsForCurrentUser();

    return { ok: true as const, data: count };
  }
}
