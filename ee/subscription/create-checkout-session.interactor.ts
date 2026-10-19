import type { SubscriptionService } from "./subscription.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import { z } from "zod";
import { headers } from "next/headers";
import { Resource, SubscriptionPlan } from "@/generated/prisma";

import type { Data } from "@/core/validation/validation.utils";
import type { GetCompanyRepo } from "@/features/company/get-company.repo";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { Validate } from "@/core/decorators/validate.decorator";
import { resolveRequestOrigin } from "@/core/config/environment";
import { redirectTo } from "@/features/auth/auth-outcome";
import { env } from "@/env";
import { getCommercialOfferOrThrow, PURCHASABLE_PLAN_IDS } from "@/core/commercial/plan-catalog";
import { failConflict, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { CreateCheckoutCompanyRepo } from "./create-checkout-session.repo";
import { checkoutExpiresAt, checkoutPendingSince } from "./checkout-state";
import { hasLiveSubscription, isSubscriptionExpired } from "./entitlements";
import { signCheckoutWorkspace } from "./checkout-workspace-signature";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { buildLocalePath } from "@/i18n/locale-registry";
import { getRequestAppLocale } from "@/i18n/request-app-locale";

const Schema = z.object({
  plan: z.enum(PURCHASABLE_PLAN_IDS),
  cadence: z.literal("monthly"),
});
export type CreateCheckoutSessionData = Data<typeof Schema>;

type CheckoutNotStarted = { ok: true; data: { checkout: "pending" | "active" } };

const CHECKOUT_PENDING: CheckoutNotStarted = { ok: true, data: { checkout: "pending" } };
const SUBSCRIPTION_ACTIVE: CheckoutNotStarted = { ok: true, data: { checkout: "active" } };

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class CreateCheckoutSessionInteractor extends UserAccessor {
  constructor(
    private lemonSqueezyService: SubscriptionService,
    private repo: CreateCheckoutCompanyRepo,
    private userRepo: CountActiveUsersRepo,
    private companyRepo: GetCompanyRepo,
  ) {
    super();
  }

  @Validate(Schema)
  async invoke(
    data: CreateCheckoutSessionData,
  ): Promise<Redirect | CheckoutNotStarted | { ok: false; error: z.ZodError }> {
    const subscription = await this.repo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise)
      return failUnavailable(CustomErrorCode.enterpriseCheckoutUnavailable, ["plan"]);
    if (hasLiveSubscription(subscription) && !isSubscriptionExpired(subscription)) return SUBSCRIPTION_ACTIVE;

    const offer = getCommercialOfferOrThrow(data.plan, data.cadence);
    const startedAt = new Date();
    const claimed = await this.repo.claimCheckoutStart({
      startedAt,
      pendingSince: checkoutPendingSince(startedAt),
      lemonSqueezyId: subscription.lemonSqueezyId,
      email: this.user.email,
    });
    if (claimed === "deleting") return failConflict(CustomErrorCode.workspaceChanged);
    if (claimed === "pending") return CHECKOUT_PENDING;

    try {
      const activeUsersCount = await this.userRepo.countActiveUsers();
      const workspaceName = (await this.companyRepo.findCompanyOrThrow()).name?.trim();

      const requestOrigin = (await headers()).get("origin") ?? env.BASE_URL;
      const baseUrl = resolveRequestOrigin(requestOrigin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);
      const redirectUrl = `${baseUrl}${buildLocalePath(await getRequestAppLocale(), settingsHref("billing"))}`;
      const checkout = await this.lemonSqueezyService.createCheckoutOrThrow({
        offer,
        quantity: activeUsersCount,
        email: this.user.email,
        ...(workspaceName ? { productName: workspaceName } : {}),
        custom: {
          company_id: this.companyId,
          company_signature: signCheckoutWorkspace(this.companyId, env.BETTER_AUTH_SECRET),
        },
        redirectUrl,
        expiresAt: checkoutExpiresAt(startedAt),
      });

      return redirectTo(checkout.data.attributes.url);
    } catch (error) {
      await this.repo.releaseCheckoutStart({ startedAt, previous: subscription.checkoutStartedAt });
      throw error;
    }
  }
}
