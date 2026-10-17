import type { SubscriptionService } from "./subscription.service";
import type { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import type { z } from "zod";

import { Resource, SubscriptionPlan } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { RefreshSubscriptionRepo } from "./refresh-subscription.repo";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class RefreshSubscriptionInteractor extends AuthenticatedInteractor<void, null> {
  constructor(
    private repo: RefreshSubscriptionRepo,
    private subscriptionService: SubscriptionService,
    private deleteAccountsForPlan: DeleteAccountsForPlanInteractor,
  ) {
    super();
  }

  async invoke(): Promise<{ ok: true; data: null } | { ok: false; error: z.ZodError }> {
    const subscription = await this.repo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise) return { ok: true as const, data: null };
    if (!subscription.lemonSqueezyId) return failUnavailable(CustomErrorCode.billingPortalUnavailable);

    const provider = await this.subscriptionService.getSubscriptionOrThrowUnscoped(subscription.lemonSqueezyId);
    const synced = await this.subscriptionService.syncSubscription(
      { companyId: this.companyId, plan: subscription.plan, lemonSqueezyId: subscription.lemonSqueezyId },
      provider,
    );
    if (!synced) return { ok: true as const, data: null };

    if (synced.changedPlan)
      await this.deleteAccountsForPlan.invoke({ companyId: synced.companyId, plan: synced.changedPlan });

    return { ok: true as const, data: null };
  }
}
