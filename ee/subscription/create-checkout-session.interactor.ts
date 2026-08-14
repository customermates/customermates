import type { SubscriptionService } from "./subscription.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import { z } from "zod";
import { headers } from "next/headers";
import { Resource, Action, SubscriptionPlan } from "@/generated/prisma";

import type { Data } from "@/core/validation/validation.utils";
import type { Subscription } from "@/generated/prisma";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { resolveRequestOrigin } from "@/core/config/environment";
import { redirectTo } from "@/features/auth/auth-outcome";
import { env } from "@/env";
import { getCommercialOfferOrThrow } from "@/core/commercial/plan-catalog";

const Schema = z.object({
  plan: z.enum([SubscriptionPlan.starter, SubscriptionPlan.pro, SubscriptionPlan.business]),
  cadence: z.literal("monthly"),
});
export type CreateCheckoutSessionData = Data<typeof Schema>;

export abstract class CreateCheckoutCompanyRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class CreateCheckoutSessionInteractor {
  constructor(
    private lemonSqueezyService: SubscriptionService,
    private repo: CreateCheckoutCompanyRepo,
    private userRepo: CountActiveUsersRepo,
  ) {}

  @Validate(Schema)
  async invoke(data: CreateCheckoutSessionData): Promise<Redirect | { ok: false; error: z.ZodError }> {
    const subscription = await this.repo.getSubscriptionOrThrow();

    if (subscription.plan === SubscriptionPlan.enterprise)
      throw new Error("Enterprise workspaces are billed manually and cannot start a self-serve checkout");

    const offer = getCommercialOfferOrThrow(data.plan, data.cadence);
    const activeUsersCount = await this.userRepo.countActiveUsers();

    const requestOrigin = (await headers()).get("origin") ?? env.BASE_URL;
    const baseUrl = resolveRequestOrigin(requestOrigin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);
    const redirectUrl = `${baseUrl}/company/subscription`;
    const checkout = await this.lemonSqueezyService.createCheckoutOrThrow({
      offer,
      quantity: activeUsersCount,
      custom: {
        company_id: getTenantUser().companyId,
      },
      redirectUrl,
    });

    return redirectTo(checkout.data.attributes.url);
  }
}
