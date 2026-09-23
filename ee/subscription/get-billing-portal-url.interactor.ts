import type { SubscriptionService } from "./subscription.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import type { z } from "zod";
import { Resource, Action, SubscriptionPlan } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { redirectTo } from "@/features/auth/auth-outcome";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export abstract class GetBillingPortalUrlRepo {
  abstract getSubscriptionOrThrow(): Promise<{ lemonSqueezyId: string | null; plan: SubscriptionPlan }>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class GetBillingPortalUrlInteractor extends UserAccessor {
  constructor(
    private repo: GetBillingPortalUrlRepo,
    private lemonSqueezyService: SubscriptionService,
  ) {
    super();
  }

  async invoke(): Promise<Redirect | { ok: false; error: z.ZodError }> {
    const subscription = await this.repo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise || !subscription.lemonSqueezyId)
      return failUnavailable(CustomErrorCode.billingPortalUnavailable);

    const lemonSqueezySubscription = await this.lemonSqueezyService.getSubscriptionOrThrowUnscoped(
      subscription.lemonSqueezyId,
    );
    const portalUrl = lemonSqueezySubscription.data.attributes.urls?.customer_portal;

    if (!portalUrl) return failUnavailable(CustomErrorCode.billingPortalUnavailable);

    return redirectTo(portalUrl);
  }
}
