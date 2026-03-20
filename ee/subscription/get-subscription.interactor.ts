import { Subscription, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { Resource, Action } from "@/generated/prisma";

import { SubscriptionService } from "./subscription.service";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { UserAccessor } from "@/core/base/user-accessor";

export abstract class GetSubscriptionRepo {
  abstract getSubscriptionOrThrow(companyId: string): Promise<Subscription>;
}

export type SubscriptionDto = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  quantity: number | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  customerPortalUrl: string | null;
};

@AllowInDemoMode
@TentantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetSubscriptionInteractor extends UserAccessor {
  constructor(
    private repo: GetSubscriptionRepo,
    private lemonSqueezyService: SubscriptionService,
  ) {
    super();
  }

  async invoke(): Promise<SubscriptionDto> {
    const subscription = await this.repo.getSubscriptionOrThrow(this.user.companyId);

    let customerPortalUrl: string | null = null;

    if (subscription.lemonSqueezyId) {
      const lemonSqueezySubscription = await this.lemonSqueezyService.getSubscriptionOrThrow(
        subscription.lemonSqueezyId,
      );
      customerPortalUrl = lemonSqueezySubscription.data.attributes.urls?.customer_portal || null;
    }

    return {
      plan: subscription.plan,
      status: subscription.status,
      quantity: subscription.quantity,
      trialEndDate: subscription.trialEndDate,
      currentPeriodEnd: subscription.currentPeriodEnd,
      customerPortalUrl,
    };
  }
}
