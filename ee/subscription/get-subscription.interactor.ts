import type { SubscriptionService } from "./subscription.service";

import { z } from "zod";
import { Resource, Action, SubscriptionStatus as SubscriptionStatusEnum } from "@/generated/prisma";

import type { Subscription, SubscriptionStatus } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

const SubscriptionDtoSchema = z.object({
  status: z.enum(SubscriptionStatusEnum),
  quantity: z.number().nullable(),
  trialEndDate: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  customerPortalUrl: z.string().nullable(),
});

export abstract class GetSubscriptionRepo {
  abstract getSubscriptionOrThrow(companyId: string): Promise<Subscription>;
}

export type SubscriptionDto = {
  status: SubscriptionStatus;
  quantity: number | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  customerPortalUrl: string | null;
};

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetSubscriptionInteractor extends AuthenticatedInteractor<void, SubscriptionDto> {
  constructor(
    private repo: GetSubscriptionRepo,
    private lemonSqueezyService: SubscriptionService,
  ) {
    super();
  }

  @ValidateOutput(SubscriptionDtoSchema)
  async invoke(): Promise<{ ok: true; data: SubscriptionDto }> {
    const subscription = await this.repo.getSubscriptionOrThrow(getTenantUser().companyId);

    let customerPortalUrl: string | null = null;

    if (subscription.lemonSqueezyId) {
      const lemonSqueezySubscription = await this.lemonSqueezyService.getSubscriptionOrThrow(
        subscription.lemonSqueezyId,
      );
      customerPortalUrl = lemonSqueezySubscription.data.attributes.urls?.customer_portal || null;
    }

    return {
      ok: true,
      data: {
        status: subscription.status,
        quantity: subscription.quantity,
        trialEndDate: subscription.trialEndDate,
        currentPeriodEnd: subscription.currentPeriodEnd,
        customerPortalUrl,
      },
    };
  }
}
