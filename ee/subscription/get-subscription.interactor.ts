import { z } from "zod";
import {
  Resource,
  SubscriptionStatus as SubscriptionStatusEnum,
  SubscriptionPlan as SubscriptionPlanEnum,
} from "@/generated/prisma";

import type { SubscriptionStatus, SubscriptionPlan } from "@/generated/prisma";
import type { CountActiveUsersRepo } from "@/features/user/count-active-users.repo";
import type { FreePlanMemberRepo } from "./free-plan-member.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { GetSubscriptionRepo } from "./get-subscription.repo";
import { CHECKOUT_STATES, checkoutStateOf, type CheckoutState } from "./checkout-state";
import { isOnFreePlan } from "./entitlements";
import { env } from "@/env";

const OutputSchema = z.object({
  status: z.enum(SubscriptionStatusEnum),
  plan: z.enum(SubscriptionPlanEnum),
  quantity: z.number().nullable(),
  activeUsers: z.number(),
  trialEndDate: z.date().nullable(),
  currentPeriodEnd: z.date().nullable(),
  hasBillingPortal: z.boolean(),
  hasActiveSubscription: z.boolean(),
  checkout: z.enum(CHECKOUT_STATES),
  onFreePlan: z.boolean(),
  pausedMembers: z.number(),
});

export type SubscriptionDto = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  quantity: number | null;
  activeUsers: number;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  hasBillingPortal: boolean;
  hasActiveSubscription: boolean;
  checkout: CheckoutState;
  onFreePlan: boolean;
  pausedMembers: number;
};

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, read: true })
export class GetSubscriptionInteractor extends AuthenticatedInteractor<void, SubscriptionDto> {
  constructor(
    private repo: GetSubscriptionRepo,
    private userRepo: CountActiveUsersRepo,
    private pauses?: Pick<FreePlanMemberRepo, "countPlanPausedMembersUnscoped">,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: SubscriptionDto }> {
    const [subscription, activeUsers] = await Promise.all([
      this.repo.getSubscriptionOrThrow(),
      this.userRepo.countActiveUsers(),
    ]);

    const onFreePlan = env.APP_MODE === "cloud" && isOnFreePlan(subscription);
    const pausedMembers =
      onFreePlan && this.pauses ? await this.pauses.countPlanPausedMembersUnscoped(this.companyId) : 0;

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
        checkout: checkoutStateOf(subscription.checkoutStartedAt),
        onFreePlan,
        pausedMembers,
      },
    };
  }
}
