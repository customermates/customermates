import type { RouteGuardCompanyRepo } from "@/features/auth/route-guard-company.repo";
import type { SubscriptionService } from "./subscription.service";

import * as ErrorReporter from "@/core/observability/server";
import { SubscriptionPlan } from "@/generated/prisma";

export class PaidSeatQuantitySync {
  constructor(
    private readonly companies: Pick<RouteGuardCompanyRepo, "getSubscriptionOrThrowUnscoped">,
    private readonly subscriptions: Pick<SubscriptionService, "updateSubscriptionQuantityOrThrow">,
  ) {}

  readonly sync = async (companyId: string, activeMembers: number): Promise<void> => {
    try {
      const subscription = await this.companies.getSubscriptionOrThrowUnscoped(companyId);
      if (subscription.plan === SubscriptionPlan.enterprise || !subscription.lemonSqueezyId) return;
      await this.subscriptions.updateSubscriptionQuantityOrThrow(subscription.lemonSqueezyId, activeMembers);
    } catch (error) {
      ErrorReporter.captureException(error, { tags: { kind: "free-plan-resume-seat-quantity", companyId } });
    }
  };
}
