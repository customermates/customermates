import type { SubscriptionService } from "./subscription.service";
import type { Redirect } from "@/features/auth/auth-outcome";

import { Resource, Action } from "@/generated/prisma";

import type { Company } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { redirectTo } from "@/features/auth/auth-outcome";
import { env } from "@/env";

export abstract class CreateCheckoutCompanyRepo {
  abstract getDetails(): Promise<Company>;
  abstract countActiveUsers(): Promise<number>;
}

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class CreateCheckoutSessionInteractor {
  constructor(
    private lemonSqueezyService: SubscriptionService,
    private repo: CreateCheckoutCompanyRepo,
  ) {}

  async invoke(): Promise<Redirect> {
    const [company, activeUsersCount] = await Promise.all([this.repo.getDetails(), this.repo.countActiveUsers()]);

    const billingAddress: { country?: string; zip?: string } = {};

    if (company.country) billingAddress.country = company.country.toUpperCase();

    if (company.postalCode) billingAddress.zip = company.postalCode;

    const redirectUrl = `${env.BASE_URL}/company/details`;

    const checkout = await this.lemonSqueezyService.createCheckout({
      email: company.email || undefined,
      name: company.name || undefined,
      country: company.country || undefined,
      zip: company.postalCode || undefined,
      taxNumber: company.vatNumber || undefined,
      custom: {
        company_id: getTenantUser().companyId,
      },
      redirectUrl,
      quantity: activeUsersCount,
    });

    return redirectTo(checkout.data.attributes.url);
  }
}
