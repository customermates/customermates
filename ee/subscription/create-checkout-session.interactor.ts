import type { SubscriptionService } from "./subscription.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { headers } from "next/headers";
import { Resource, Action, SubscriptionPlan } from "@/generated/prisma";

import type { Data } from "@/core/validation/validation.utils";
import type { Subscription } from "@/generated/prisma";
import type { CheckoutReservation } from "./checkout-reservation";
import type { CommercialOffer } from "@/core/commercial/plan-catalog";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { resolveRequestOrigin } from "@/core/config/environment";
import { redirectTo } from "@/features/auth/auth-outcome";
import { env } from "@/env";
import {
  CHECKOUT_RESERVATION_TTL_MINUTES,
  CHECKOUT_SESSION_TTL_MINUTES,
  getCommercialOfferOrThrow,
} from "@/core/commercial/plan-catalog";

const Schema = z.object({
  plan: z.enum([SubscriptionPlan.starter, SubscriptionPlan.pro, SubscriptionPlan.business]),
  cadence: z.literal("monthly"),
});
export type CreateCheckoutSessionData = Data<typeof Schema>;

export abstract class CreateCheckoutCompanyRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;

  abstract claimCheckoutReservationOrThrow(options: {
    secret: string;
    offer: CommercialOffer;
    checkoutExpiresAt: Date;
    bindingExpiresAt: Date;
    now: Date;
  }): Promise<{ reservation: CheckoutReservation; quantity: number }>;

  abstract releaseCheckoutReservationIfMatches(marker: string): Promise<boolean>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class CreateCheckoutSessionInteractor {
  constructor(
    private lemonSqueezyService: SubscriptionService,
    private repo: CreateCheckoutCompanyRepo,
  ) {}

  @Validate(Schema)
  async invoke(data: CreateCheckoutSessionData): Promise<Redirect | { ok: false; error: z.ZodError }> {
    const subscription = await this.repo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise)
      throw new Error("Enterprise workspaces are billed manually and cannot start a self-serve checkout");

    if (subscription.lemonSqueezyId)
      throw new Error("This workspace already has a Lemon Squeezy subscription; use the customer portal instead");

    const offer = getCommercialOfferOrThrow(data.plan, data.cadence);
    const expiresAt = new Date(Date.now() + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);
    const bindingExpiresAt = new Date(Date.now() + CHECKOUT_RESERVATION_TTL_MINUTES * 60 * 1000);

    const requestOrigin = (await headers()).get("origin") ?? env.BASE_URL;
    const baseUrl = resolveRequestOrigin(requestOrigin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);
    const redirectUrl = `${baseUrl}/company/subscription`;
    const companyId = getTenantUser().companyId;
    const { reservation, quantity } = await this.repo.claimCheckoutReservationOrThrow({
      secret: env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "",
      offer,
      checkoutExpiresAt: expiresAt,
      bindingExpiresAt,
      now: new Date(),
    });

    const checkout = await (async () => {
      try {
        return await this.lemonSqueezyService.createCheckoutOrThrow({
          offer,
          quantity,
          custom: {
            company_id: companyId,
            checkout_token: reservation.token,
          },
          redirectUrl,
          expiresAt,
        });
      } catch (providerError) {
        try {
          await this.repo.releaseCheckoutReservationIfMatches(reservation.marker);
        } catch (releaseError) {
          Sentry.captureException(releaseError, {
            tags: { kind: "checkout-reservation-release-failure" },
          });
        }

        throw providerError;
      }
    })();

    return redirectTo(checkout.data.attributes.url);
  }
}
