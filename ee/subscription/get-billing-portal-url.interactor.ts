import type { SubscriptionService } from "./subscription.service";

import { z } from "zod";
import { Resource, Action, SubscriptionPlan } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const OutputSchema = z.string().nullable();

export abstract class GetBillingPortalUrlRepo {
  abstract getSubscriptionOrThrow(): Promise<{ lemonSqueezyId: string | null; plan: SubscriptionPlan }>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class GetBillingPortalUrlInteractor extends AuthenticatedInteractor<void, string | null> {
  constructor(
    private repo: GetBillingPortalUrlRepo,
    private lemonSqueezyService: SubscriptionService,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: string | null }> {
    const subscription = await this.repo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise || !subscription.lemonSqueezyId)
      return { ok: true as const, data: null };

    const lemonSqueezySubscription = await this.lemonSqueezyService.getSubscriptionOrThrowUnscoped(
      subscription.lemonSqueezyId,
    );

    return { ok: true as const, data: lemonSqueezySubscription.data.attributes.urls?.customer_portal || null };
  }
}
