import { Resource, Action } from "@/generated/prisma";

import { SubscriptionService } from "./subscription.service";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UserAccessor } from "@/core/base/user-accessor";

export abstract class RefreshSubscriptionRepo {
  abstract getSubscriptionOrThrow(companyId: string): Promise<{ lemonSqueezyId: string | null }>;
}

@TentantInteractor({ resource: Resource.company, action: Action.readOwn })
export class RefreshSubscriptionInteractor extends UserAccessor {
  constructor(
    private repo: RefreshSubscriptionRepo,
    private subscriptionService: SubscriptionService,
  ) {
    super();
  }

  async invoke(): Promise<void> {
    const subscription = await this.repo.getSubscriptionOrThrow(this.user.companyId);

    if (!subscription.lemonSqueezyId) throw new Error("Subscription does not have a LemonSqueezy ID");

    await this.subscriptionService.updateSubscriptionOrThrow(subscription.lemonSqueezyId, this.user.companyId);
  }
}
