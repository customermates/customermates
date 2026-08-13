import type { SubscriptionService } from "./subscription.service";

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
import { getTenantUser } from "@/core/decorators/tenant-context";

const OutputSchema = z.object({
  status: z.enum(SubscriptionStatusEnum),
  plan: z.enum(SubscriptionPlanEnum),
  quantity: z.number().nullable(),
  activeUsers: z.number(),
  trialEndDate: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  customerPortalUrl: z.string().nullable(),
  hasProviderSubscription: z.boolean(),
  canManageSubscription: z.boolean(),
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
  customerPortalUrl: string | null;
  hasProviderSubscription: boolean;
  canManageSubscription: boolean;
};

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetSubscriptionInteractor extends AuthenticatedInteractor<void, SubscriptionDto> {
  constructor(
    private repo: GetSubscriptionRepo,
    private userRepo: CountActiveUsersRepo,
    private lemonSqueezyService: SubscriptionService,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: SubscriptionDto }> {
    const [subscription, activeUsers] = await Promise.all([
      this.repo.getSubscriptionOrThrow(),
      this.userRepo.countActiveUsers(),
    ]);

    let customerPortalUrl: string | null = null;
    const user = getTenantUser();
    const canManageSubscription =
      user.role?.isSystemRole === true ||
      (user.role?.permissions.some(
        (permission) => permission.resource === Resource.company && permission.action === Action.update,
      ) ??
        false);

    if (canManageSubscription && subscription.lemonSqueezyId && subscription.plan !== SubscriptionPlanEnum.enterprise) {
      const lemonSqueezySubscription = await this.lemonSqueezyService.getSubscriptionOrThrowUnscoped(
        subscription.lemonSqueezyId,
      );
      customerPortalUrl = lemonSqueezySubscription.data.attributes.urls?.customer_portal || null;
    }

    return {
      ok: true,
      data: {
        status: subscription.status,
        plan: subscription.plan,
        quantity: subscription.quantity,
        activeUsers,
        trialEndDate: subscription.trialEndDate,
        currentPeriodEnd: subscription.currentPeriodEnd,
        customerPortalUrl,
        hasProviderSubscription: Boolean(subscription.lemonSqueezyId),
        canManageSubscription,
      },
    };
  }
}
