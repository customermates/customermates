import type { SubscriptionService } from "./subscription.service";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import type { Company } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { env } from "@/env";

export abstract class CreateCheckoutCompanyRepo {
  abstract getDetails(): Promise<Company>;
  abstract countActiveUsers(): Promise<number>;
}

@TentantInteractor({ resource: Resource.company, action: Action.update })
export class CreateCheckoutSessionInteractor extends BaseInteractor<void, null> {
  constructor(
    private lemonSqueezyService: SubscriptionService,
    private repo: CreateCheckoutCompanyRepo,
  ) {
    super();
  }

  @ValidateOutput(z.null())
  async invoke(): Promise<{ ok: true; data: null }> {
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

    redirect(checkout.data.attributes.url);
  }
}
