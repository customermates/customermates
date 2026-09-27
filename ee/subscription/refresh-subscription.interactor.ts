import type { SubscriptionService } from "./subscription.service";
import type { DeleteAccountsForPlanInteractor } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import type { z } from "zod";

import { Resource, Action, SubscriptionPlan } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export abstract class RefreshSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{ lemonSqueezyId: string | null; plan: SubscriptionPlan }>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
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

    const { companyId, changedPlan } = await this.subscriptionService.updateSubscriptionOrThrow(
      subscription.lemonSqueezyId,
      this.companyId,
    );

    if (changedPlan) await this.deleteAccountsForPlan.invoke({ companyId, plan: changedPlan });

    return { ok: true as const, data: null };
  }
}
