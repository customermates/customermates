import { redirect } from "next/navigation";

import { Company, Resource, Action } from "@/generated/prisma";

import { SubscriptionService } from "./subscription.service";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { BASE_URL } from "@/constants/env";

export abstract class CreateCheckoutCompanyRepo {
  abstract getDetails(): Promise<Company>;
  abstract countActiveUsers(): Promise<number>;
}

@TentantInteractor({ resource: Resource.company, action: Action.update })
export class CreateCheckoutSessionInteractor extends UserAccessor {
  constructor(
    private lemonSqueezyService: SubscriptionService,
    private repo: CreateCheckoutCompanyRepo,
  ) {
    super();
  }

  async invoke(): Promise<void> {
    const [company, activeUsersCount] = await Promise.all([this.repo.getDetails(), this.repo.countActiveUsers()]);

    const billingAddress: { country?: string; zip?: string } = {};

    if (company.country) billingAddress.country = company.country.toUpperCase();

    if (company.postalCode) billingAddress.zip = company.postalCode;

    const redirectUrl = `${BASE_URL}/company`;

    const checkout = await this.lemonSqueezyService.createCheckout({
      email: company.email || undefined,
      name: company.name || undefined,
      country: company.country || undefined,
      zip: company.postalCode || undefined,
      taxNumber: company.vatNumber || undefined,
      custom: {
        company_id: this.user.companyId,
      },
      redirectUrl,
      quantity: activeUsersCount,
    });

    redirect(checkout.data.attributes.url);
  }
}
