import type { SubscriptionService } from "./subscription.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import type { z } from "zod";
import { Resource, SubscriptionPlan } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { redirectTo } from "@/features/auth/auth-outcome";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { GetBillingPortalUrlRepo } from "./get-billing-portal-url.repo";

function isPayer(payerEmail: string | null | undefined, memberEmail: string) {
  const payer = payerEmail?.trim().toLowerCase();
  return Boolean(payer) && payer === memberEmail.trim().toLowerCase();
}

@TenantInteractor({ resource: Resource.company, manage: "update" })
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
    const { user_email: payerEmail, urls } = lemonSqueezySubscription.data.attributes;
    const portalUrl = isPayer(payerEmail, this.user.email) ? urls?.customer_portal : urls?.update_payment_method;

    if (!portalUrl) return failUnavailable(CustomErrorCode.billingPortalUnavailable);

    return redirectTo(portalUrl);
  }
}
