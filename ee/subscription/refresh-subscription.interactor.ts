import type { SubscriptionService } from "./subscription.service";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export abstract class RefreshSubscriptionRepo {
  abstract getSubscriptionOrThrow(companyId: string): Promise<{ lemonSqueezyId: string | null }>;
}

@TenantInteractor({ resource: Resource.company, action: Action.readOwn })
export class RefreshSubscriptionInteractor extends AuthenticatedInteractor<void, null> {
  constructor(
    private repo: RefreshSubscriptionRepo,
    private subscriptionService: SubscriptionService,
  ) {
    super();
  }

  @ValidateOutput(z.null())
  async invoke(): Promise<{ ok: true; data: null }> {
    const subscription = await this.repo.getSubscriptionOrThrow(this.companyId);

    if (!subscription.lemonSqueezyId) throw new Error("Subscription does not have a LemonSqueezy ID");

    await this.subscriptionService.updateSubscriptionOrThrow(subscription.lemonSqueezyId, this.companyId);

    return { ok: true as const, data: null };
  }
}
