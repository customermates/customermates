import type { SubscriptionService } from "./subscription.service";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

export abstract class RefreshSubscriptionRepo {
  abstract getSubscriptionOrThrow(companyId: string): Promise<{ lemonSqueezyId: string | null }>;
}

@TentantInteractor({ resource: Resource.company, action: Action.readOwn })
export class RefreshSubscriptionInteractor extends BaseInteractor<void, null> {
  constructor(
    private repo: RefreshSubscriptionRepo,
    private subscriptionService: SubscriptionService,
  ) {
    super();
  }

  @ValidateOutput(z.null())
  async invoke(): Promise<{ ok: true; data: null }> {
    const subscription = await this.repo.getSubscriptionOrThrow(getTenantUser().companyId);

    if (!subscription.lemonSqueezyId) throw new Error("Subscription does not have a LemonSqueezy ID");

    await this.subscriptionService.updateSubscriptionOrThrow(subscription.lemonSqueezyId, getTenantUser().companyId);

    return { ok: true as const, data: null };
  }
}
