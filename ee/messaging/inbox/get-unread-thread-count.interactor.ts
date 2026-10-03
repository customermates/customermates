import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class GetUnreadThreadCountRepo {
  abstract countUnreadThreadsForCurrentUser(): Promise<number>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
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
