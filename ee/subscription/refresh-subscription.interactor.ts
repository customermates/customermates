import type { SubscriptionService } from "./subscription.service";
import type { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";

import { Resource, Action, SubscriptionPlan } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export abstract class RefreshSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{
    lemonSqueezyId: string | null;
    plan: SubscriptionPlan;
  }>;
}

@TenantInteractor({ resource: Resource.company, action: Action.readOwn })
export class RefreshSubscriptionInteractor extends AuthenticatedInteractor<void, null> {
  constructor(
    private repo: RefreshSubscriptionRepo,
    private subscriptionService: SubscriptionService,
    private deleteAccountsForPlan: DeleteAccountsForPlanInteractor,
  ) {
    super();
  }

  async invoke(): Promise<{ ok: true; data: null }> {
    const subscription = await this.repo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise) return { ok: true as const, data: null };
    if (!subscription.lemonSqueezyId) throw new Error("Subscription does not have a LemonSqueezy ID");

    const { companyId, changedPlan } = await this.subscriptionService.updateSubscriptionOrThrow(
      subscription.lemonSqueezyId,
      this.companyId,
    );

    if (changedPlan) await this.deleteAccountsForPlan.invoke({ companyId, plan: changedPlan });

    return { ok: true as const, data: null };
  }
}
