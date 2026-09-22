import { z } from "zod";
import {
  Resource,
  Action,
  SubscriptionStatus as SubscriptionStatusEnum,
  SubscriptionPlan as SubscriptionPlanEnum,
} from "@/generated/prisma";

import type { Subscription, SubscriptionStatus, SubscriptionPlan } from "@/generated/prisma";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const OutputSchema = z.object({
  status: z.enum(SubscriptionStatusEnum),
  plan: z.enum(SubscriptionPlanEnum),
  quantity: z.number().nullable(),
  activeUsers: z.number(),
  trialEndDate: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  hasBillingPortal: z.boolean(),
  hasActiveSubscription: z.boolean(),
});

export abstract class GetSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;
}

export type SubscriptionDto = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  quantity: number | null;
  activeUsers: number;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  hasBillingPortal: boolean;
  hasActiveSubscription: boolean;
};

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetSubscriptionInteractor extends AuthenticatedInteractor<void, SubscriptionDto> {
  constructor(
    private repo: GetSubscriptionRepo,
    private userRepo: CountActiveUsersRepo,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: SubscriptionDto }> {
    const [subscription, activeUsers] = await Promise.all([
      this.repo.getSubscriptionOrThrow(),
      this.userRepo.countActiveUsers(),
    ]);

    return {
      ok: true,
      data: {
        status: subscription.status,
        plan: subscription.plan,
        quantity: subscription.quantity,
        activeUsers,
        trialEndDate: subscription.trialEndDate,
        currentPeriodEnd: subscription.currentPeriodEnd,
        hasBillingPortal: subscription.plan !== SubscriptionPlanEnum.enterprise && Boolean(subscription.lemonSqueezyId),
        hasActiveSubscription: Boolean(subscription.lemonSqueezyId),
      },
    };
  }
}
