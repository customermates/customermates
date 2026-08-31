import type { OperatorRiskSummaryDto } from "./operator-lists.schema";

import type { Prisma } from "@/generated/prisma";
import { SubscriptionStatus as SubscriptionStatusEnum } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaOperatorRiskSummaryRepo extends BaseRepository<Prisma.CompanyWhereInput> {
  @BypassTenantGuard
  async getRiskSummaryUnscoped(now = new Date()): Promise<OperatorRiskSummaryDto> {
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [pastDue, unpaid, expired, trialsEnding, activeUsers, newWorkspaces, newUsers] = await Promise.all([
      this.prisma.subscription.count({ where: { status: SubscriptionStatusEnum.pastDue } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatusEnum.unPaid } }),
      this.prisma.subscription.count({ where: { status: SubscriptionStatusEnum.expired } }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatusEnum.trial, trialEndDate: { gte: now, lte: sevenDaysAhead } },
      }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: sevenDaysAgo } } }),
      this.prisma.company.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return {
      subscriptionsPastDue: pastDue,
      subscriptionsUnpaid: unpaid,
      subscriptionsExpired: expired,
      trialsEndingWithinSevenDays: trialsEnding,
      activeUsersLastSevenDays: activeUsers,
      newWorkspacesLastThirtyDays: newWorkspaces,
      newUsersLastThirtyDays: newUsers,
    };
  }
}
