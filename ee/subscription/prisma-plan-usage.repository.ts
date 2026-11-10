import type { PlanUsageRepo, PlanUsageSubscription } from "./plan-usage.repo";
import type { PlanFitUsage } from "@/core/commercial/plan-fit";

import { AgentUsagePurpose, AgentUsageState, ConnectedAccountStatus, Status } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaPlanUsageRepo extends TenantRepository implements PlanUsageRepo {
  @BypassTenantGuard
  async findPlanSubscriptionUnscoped(companyId: string): Promise<PlanUsageSubscription | null> {
    return this.prisma.subscription.findUnique({
      where: { companyId },
      select: { status: true, plan: true, trialEndDate: true, currentPeriodEnd: true },
    });
  }

  @BypassTenantGuard
  async countSeatsUnscoped(companyId: string): Promise<number> {
    return this.prisma.user.count({
      where: { companyId, leftAt: null, status: { in: [Status.active, Status.pendingAuthorization] } },
    });
  }

  @BypassTenantGuard
  async countRecordsUnscoped(companyId: string): Promise<number> {
    return this.prisma.crmRecord.count({
      where: { companyId, deletedAt: null, type: { embedded: false, archived: false } },
    });
  }

  @BypassTenantGuard
  async countPlanPausedMembersUnscoped(companyId: string): Promise<number> {
    return this.prisma.user.count({ where: { companyId, leftAt: null, pausedByPlanAt: { not: null } } });
  }

  @BypassTenantGuard
  async storageUsedBytesUnscoped(companyId: string): Promise<number> {
    const usage = await this.prisma.recordFile.aggregate({ where: { companyId }, _sum: { size: true } });
    return Number(usage._sum.size ?? 0n);
  }

  @BypassTenantGuard
  async countApiRequestsOnDayUnscoped(companyId: string, dayStart: Date): Promise<number> {
    const row = await this.prisma.apiRateLimitWindow.findUnique({
      where: { companyId_window_windowStart: { companyId, window: "day", windowStart: dayStart } },
      select: { count: true },
    });
    return row?.count ?? 0;
  }

  @BypassTenantGuard
  async readFeatureUsageUnscoped(companyId: string): Promise<PlanFitUsage> {
    const liveAccount = { status: { not: ConnectedAccountStatus.deleted } };
    const [members, accounts, sharedAccounts, openDrafts, routines, webhooks, mateRequests, apiKeys, oauthClients] =
      await Promise.all([
        this.prisma.user.count({ where: { companyId, leftAt: null, status: Status.active, pausedByPlanAt: null } }),
        this.prisma.connectedAccount.groupBy({
          by: ["userId"],
          where: { companyId, ...liveAccount },
          _count: { _all: true },
        }),
        this.prisma.connectedAccount.count({ where: { companyId, shared: true, ...liveAccount } }),
        this.prisma.messagingMessage.count({
          where: { companyId, isDraft: true, isDeleted: false, connectedAccount: liveAccount },
        }),
        this.prisma.routine.groupBy({
          by: ["ownerUserId"],
          where: { companyId, enabled: true, deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.webhook.count({ where: { companyId, enabled: true } }),
        this.prisma.agentUsageEvent.count({
          where: { companyId, purpose: AgentUsagePurpose.turn, state: { not: AgentUsageState.released } },
        }),
        this.prisma.apikey.count({ where: { companyId, enabled: true } }),
        this.prisma.oauthAccessToken.findMany({
          where: { companyId },
          distinct: ["clientId"],
          select: { clientId: true },
        }),
      ]);
    const total = (groups: Array<{ _count: { _all: number } }>) =>
      groups.reduce((sum, group) => sum + group._count._all, 0);
    const largest = (groups: Array<{ _count: { _all: number } }>) =>
      groups.reduce((max, group) => Math.max(max, group._count._all), 0);

    return {
      members,
      connectedAccounts: total(accounts),
      maxAccountsPerUser: largest(accounts),
      sharedAccounts,
      openDrafts,
      activeRoutines: total(routines),
      maxRoutinesPerOwner: largest(routines),
      webhooks,
      mateRequests,
      apiClients: apiKeys + oauthClients.length,
    };
  }
}
