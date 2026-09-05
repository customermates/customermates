import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DateBucket } from "@/core/base/grouping/grouping.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { OperatorUserRowDto } from "./operator-lists.schema";
import type { GetOperatorUsersRepo } from "./get/get-operator-users.interactor";

import type { Prisma, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { dateGroupables, enumGroupables } from "@/core/base/grouping/groupable-field";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

import { resolveAgentCreditEntitlement } from "@/ee/agent-chat/agent-credit-policy";
import { env } from "@/env";
import { Status } from "@/generated/prisma";

import {
  applyGroupScopeAsFilters,
  countOperatorGroups,
  operatorCollator,
  partitionOperatorUserFilters,
  resolveWorkspaceLabels,
  resolveWorkspaceOwners,
} from "./operator-list-filters";

export class PrismaOperatorUsersRepo extends BaseRepository<Prisma.UserWhereInput> implements GetOperatorUsersRepo {
  getSearchableFields() {
    return [{ field: "email" }, { field: "firstName" }, { field: "lastName" }];
  }

  getSortableFields() {
    return [
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "lastActiveAt", resolvedFields: ["lastActiveAt"] },
      { field: "email", resolvedFields: ["email"] },
      { field: "status", resolvedFields: ["status"] },
    ];
  }

  getFilterableFields() {
    return Promise.resolve(
      [
        FilterFieldKey.status,
        FilterFieldKey.plan,
        FilterFieldKey.subscriptionStatus,
        FilterFieldKey.isPlatformOperator,
        FilterFieldKey.lastActiveAt,
        FilterFieldKey.createdAt,
        FilterFieldKey.updatedAt,
        FilterFieldKey.workspaceId,
        FilterFieldKey.adProvider,
        FilterFieldKey.workspaceTags,
      ].map((field) => ({ field, operators: FILTER_FIELD_DEFAULT_OPERATORS[field] })),
    );
  }

  getGroupableFields(): Promise<GroupableFieldSpec[]> {
    return Promise.resolve([
      ...enumGroupables("user", { status: true, plan: true, subscriptionStatus: true }),
      ...dateGroupables("user", { createdAt: true, updatedAt: true }),
    ]);
  }

  collator() {
    return operatorCollator();
  }

  countByGroup(args: {
    spec: GroupableFieldSpec;
    params: GetQueryParams;
    bucket?: DateBucket;
    now?: string;
  }): Promise<GroupCountRow[]> {
    return countOperatorGroups(args.spec, args.bucket, args.now, (groupScope) =>
      this.countRowsUnscoped({ ...args.params, groupScope }),
    );
  }

  async getItems(params: GetQueryParams): Promise<OperatorUserRowDto[]> {
    return this.listRowsUnscoped(params);
  }

  async getCount(params: GetQueryParams): Promise<number> {
    return this.countRowsUnscoped(params);
  }

  @BypassTenantGuard
  private async listRowsUnscoped(scoped: GetQueryParams, now = new Date()): Promise<OperatorUserRowDto[]> {
    const params = applyGroupScopeAsFilters(scoped);
    if (!params) return [];

    const { baseWhere, passthrough } = partitionOperatorUserFilters(params.filters);
    const args = await this.buildQueryArgs({ ...params, filters: passthrough }, baseWhere);

    const users = await this.prisma.user.findMany({
      ...args,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        isPlatformOperator: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true,
        companyId: true,
        adAttributions: {
          select: { provider: true, identifierKind: true },
          orderBy: { clickedAt: "desc" },
          take: 1,
        },
        agentCreditActivatedAt: true,
        company: {
          select: {
            tags: true,
            subscription: {
              select: {
                plan: true,
                status: true,
                quantity: true,
                updatedAt: true,
                trialEndDate: true,
                agentCreditAnchorAt: true,
                enterpriseAgentCreditsPerUser: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const companyIds = [...new Set(users.map((user) => user.companyId))];
    const [labels, owners] = await Promise.all([
      resolveWorkspaceLabels(this.prisma, companyIds),
      resolveWorkspaceOwners(this.prisma, companyIds),
    ]);
    const credits = await this.creditPositionsUnscoped(users, now);

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      isPlatformOperator: user.isPlatformOperator,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      companyId: user.companyId,
      workspaceLabel: labels.get(user.companyId) ?? user.companyId.slice(0, 8),
      workspaceOwnerEmail: owners.get(user.companyId) ?? null,
      workspaceTags: user.company.tags,
      plan: user.company.subscription?.plan ?? null,
      subscriptionStatus: user.company.subscription?.status ?? null,
      subscriptionQuantity: user.company.subscription?.quantity ?? null,
      subscriptionUpdatedAt: user.company.subscription?.updatedAt ?? null,
      adProvider: user.adAttributions[0]?.provider ?? null,
      adIdentifierKind: user.adAttributions[0]?.identifierKind ?? null,
      creditsRemaining: credits.get(user.id)?.remaining ?? null,
      creditsLimit: credits.get(user.id)?.limit ?? null,
      creditsBlockedReason: credits.get(user.id)?.blockedReason ?? null,
    }));
  }

  @BypassTenantGuard
  private async creditPositionsUnscoped(
    users: {
      id: string;
      companyId: string;
      status: Status;
      agentCreditActivatedAt: Date | null;
      company: {
        subscription: {
          plan: SubscriptionPlan;
          status: SubscriptionStatus;
          trialEndDate: Date | null;
          agentCreditAnchorAt: Date | null;
          enterpriseAgentCreditsPerUser: number | null;
          createdAt: Date;
        } | null;
      };
    }[],
    now: Date,
  ): Promise<Map<string, { remaining: number; limit: number; blockedReason: string | null }>> {
    const positions = new Map<string, { remaining: number; limit: number; blockedReason: string | null }>();
    if (users.length === 0) return positions;

    const entitlements = new Map<string, { start: Date; resetAt: Date; limit: number; blockedReason: string | null }>();
    for (const user of users) {
      const subscription = user.company.subscription;
      if (!subscription) continue;

      const creditAnchorAt = subscription.agentCreditAnchorAt ?? subscription.createdAt;
      if (creditAnchorAt.getTime() > now.getTime()) continue;

      const entitlement = resolveAgentCreditEntitlement({
        appMode: env.APP_MODE,
        plan: subscription.plan,
        status: subscription.status,
        trialEndDate: subscription.trialEndDate,
        creditAnchorAt,
        enterpriseCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
        activeSeatAt: user.agentCreditActivatedAt,
        now,
      });
      entitlements.set(user.id, {
        start: entitlement.start,
        resetAt: entitlement.resetAt,
        limit: entitlement.limit,
        blockedReason: entitlement.blockedReason,
      });
    }

    const userIds = [...entitlements.keys()];
    if (userIds.length === 0) return positions;

    const [adjustments, settled, reserved] = await Promise.all([
      this.prisma.agentCreditAdjustment.groupBy({
        by: ["userId", "periodStart", "periodEnd"],
        where: { userId: { in: userIds } },
        _sum: { creditDelta: true },
      }),
      this.prisma.agentUsageEvent.groupBy({
        by: ["userId", "periodStart", "periodEnd"],
        where: { userId: { in: userIds }, state: "settled" },
        _sum: { chargedCredits: true },
      }),
      this.prisma.agentUsageEvent.groupBy({
        by: ["userId", "periodStart", "periodEnd"],
        where: { userId: { in: userIds }, state: { in: ["reserved", "retained"] } },
        _sum: { reservedCredits: true },
      }),
    ]);

    const periodKey = (userId: string, start: Date, end: Date) => `${userId}:${start.getTime()}:${end.getTime()}`;
    const adjustmentByPeriod = new Map<string, number>();
    for (const row of adjustments)
      adjustmentByPeriod.set(periodKey(row.userId, row.periodStart, row.periodEnd), row._sum.creditDelta ?? 0);

    const committedByPeriod = new Map<string, number>();
    for (const row of settled) {
      const key = periodKey(row.userId, row.periodStart, row.periodEnd);
      committedByPeriod.set(key, (committedByPeriod.get(key) ?? 0) + (row._sum.chargedCredits ?? 0));
    }
    for (const row of reserved) {
      const key = periodKey(row.userId, row.periodStart, row.periodEnd);
      committedByPeriod.set(key, (committedByPeriod.get(key) ?? 0) + (row._sum.reservedCredits ?? 0));
    }

    for (const user of users) {
      const entitlement = entitlements.get(user.id);
      if (!entitlement) continue;

      const key = periodKey(user.id, entitlement.start, entitlement.resetAt);
      const activeSeat = user.status === Status.active;
      const limit = activeSeat ? entitlement.limit + (adjustmentByPeriod.get(key) ?? 0) : 0;
      const remaining = Math.max(0, limit - (committedByPeriod.get(key) ?? 0));
      positions.set(user.id, {
        remaining,
        limit: Math.max(0, limit),
        blockedReason: activeSeat ? entitlement.blockedReason : "subscription_unavailable",
      });
    }

    return positions;
  }

  @BypassTenantGuard
  private async countRowsUnscoped(scoped: GetQueryParams): Promise<number> {
    const params = applyGroupScopeAsFilters(scoped);
    if (!params) return 0;

    const { baseWhere, passthrough } = partitionOperatorUserFilters(params.filters);
    const { where } = await this.buildQueryArgs({ ...params, filters: passthrough }, baseWhere);

    return this.prisma.user.count({ where });
  }
}
