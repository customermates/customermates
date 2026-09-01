import type { Prisma } from "@/generated/prisma";
import { Status, SubscriptionPlan, SubscriptionStatus, TaskType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { getOperatorActor } from "@/core/decorators/operator-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AGENT_CREDIT_MICROCENTS, resolveAgentCreditEntitlement } from "@/ee/agent-chat/agent-credit-policy";
import { env } from "@/env";

import { normalizeOperatorEmail } from "./operator-access.service";
import type { OperatorRefusal, OperatorRepo } from "./operator.repo";
import {
  OPERATOR_AUDIT_ACTION,
  type AgentCreditAdjustmentDto,
  type CorrectOperatorSubscriptionSnapshotData,
  type CreateAgentCreditAdjustmentData,
  type DeleteOperatorWorkspaceData,
  type DeleteOperatorWorkspaceResultDto,
  type HostedAiOperatorCompanyDto,
  type HostedAiOperatorOverviewDto,
  type HostedAiUsageTotalsDto,
  type OperatorUserCreditPeriodDto,
  type OperatorUserDetailDto,
  type OperatorUserSummaryDto,
  type ResetOperatorUserCreditsData,
  type ResetOperatorUserCreditsResultDto,
  type UpdateHostedAiEnterpriseAllowanceData,
  type UpdateOperatorUserPlatformAccessData,
  type UpdateOperatorUserStatusData,
} from "./operator.schema";

function workspaceLabelFor(companyId: string, members: { email: string }[]): string {
  const counts = new Map<string, number>();
  for (const member of members) {
    const domain = member.email.split("@")[1];
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return ranked[0]?.[0] ?? companyId.slice(0, 8);
}

type AuditAction = (typeof OPERATOR_AUDIT_ACTION)[keyof typeof OPERATOR_AUDIT_ACTION];
const MAX_ADJUSTMENT_CREDITS = 1_000_000;

const operatorUserDetailSelect = {
  id: true,
  companyId: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  isPlatformOperator: true,
  createdAt: true,
  updatedAt: true,
  lastActiveAt: true,
  agentCreditActivatedAt: true,
  role: { select: { name: true, isSystemRole: true } },
  company: {
    select: {
      subscription: {
        select: {
          plan: true,
          status: true,
          quantity: true,
          lemonSqueezyId: true,
          enterpriseAgentCreditsPerUser: true,
          agentCreditAnchorAt: true,
          trialEndDate: true,
          currentPeriodEnd: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type OperatorUserRecord = Prisma.UserGetPayload<{
  select: typeof operatorUserDetailSelect;
}>;

function utcMonth(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function asSafeCreditCount(value: number | null | undefined, description: string): number {
  const count = value ?? 0;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${description} is invalid.`);
  return count;
}

function asSafeSignedCreditCount(value: number | null | undefined, description: string): number {
  const count = value ?? 0;
  if (!Number.isSafeInteger(count)) throw new Error(`${description} is invalid.`);
  return count;
}

function addSafeCreditCounts(left: number, right: number, description: string): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`${description} is invalid.`);
  return total;
}

function asSafeBigIntCount(value: bigint | null | undefined, description: string): number {
  const count = value ?? 0n;
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${description} is invalid.`);
  return Number(count);
}

function emptyUserSummary(): OperatorUserSummaryDto {
  return {
    totalUsers: 0,
    totalCompanies: 0,
    platformOperators: 0,
    verifiedAuthUsers: 0,
    byStatus: { active: 0, inactive: 0, pendingAuthorization: 0 },
    byPlan: { starter: 0, pro: 0, business: 0, enterprise: 0, missing: 0 },
    bySubscriptionStatus: {
      trial: 0,
      active: 0,
      cancelled: 0,
      expired: 0,
      pastDue: 0,
      unPaid: 0,
      missing: 0,
    },
  };
}

function toUsageTotals(input: {
  settledCostMicrocents: bigint | null | undefined;
  chargedCredits: number | null | undefined;
  reservedCredits: number | null | undefined;
}): HostedAiUsageTotalsDto {
  const settled = input.settledCostMicrocents ?? 0n;
  const reservedCredits = asSafeCreditCount(input.reservedCredits, "Reserved hosted-AI credits");
  const chargedCredits = asSafeCreditCount(input.chargedCredits, "Charged hosted-AI credits");
  if (settled < 0n) throw new Error("Settled hosted-AI cost is invalid.");

  const reservedExposure = BigInt(reservedCredits) * BigInt(AGENT_CREDIT_MICROCENTS);
  return {
    settledCostMicrocents: settled.toString(),
    reservedExposureMicrocents: reservedExposure.toString(),
    totalCommittedMicrocents: (settled + reservedExposure).toString(),
    chargedCredits,
    reservedCredits,
  };
}

export class PrismaOperatorRepo extends BaseRepository implements OperatorRepo {
  private async createAudit(args: {
    action: AuditAction;
    targetCompanyId?: string | null;
    targetUserId?: string | null;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    const actor = getOperatorActor();
    await this.prisma.operatorAuditEvent.create({
      data: {
        actorUserId: actor.userId,
        action: args.action,
        targetCompanyId: args.targetCompanyId ?? null,
        targetUserId: args.targetUserId ?? null,
        reason: args.reason ?? null,
        metadata: args.metadata,
      },
    });
  }

  private async usageTotals(companyId: string | null, now: Date): Promise<HostedAiUsageTotalsDto> {
    const month = utcMonth(now);
    const companyWhere = companyId ? { companyId } : {};
    const [settled, reserved] = await Promise.all([
      this.prisma.agentUsageEvent.aggregate({
        where: {
          ...companyWhere,
          state: "settled",
          settledAt: { gte: month.start, lt: month.end },
        },
        _sum: { costMicrocents: true, chargedCredits: true },
      }),
      this.prisma.agentUsageEvent.aggregate({
        where: { ...companyWhere, state: { in: ["reserved", "retained"] } },
        _sum: { reservedCredits: true },
      }),
    ]);

    return toUsageTotals({
      settledCostMicrocents: settled._sum.costMicrocents,
      chargedCredits: settled._sum.chargedCredits,
      reservedCredits: reserved._sum.reservedCredits,
    });
  }

  private async companySnapshot(companyId: string, now: Date): Promise<HostedAiOperatorCompanyDto | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            enterpriseAgentCreditsPerUser: true,
            agentCreditAnchorAt: true,
            trialEndDate: true,
            currentPeriodEnd: true,
          },
        },
        _count: { select: { users: true } },
      },
    });
    if (!company?.subscription) return null;

    const [activeUsers, usage] = await Promise.all([
      this.prisma.user.count({ where: { companyId, status: Status.active } }),
      this.usageTotals(companyId, now),
    ]);

    return {
      companyId,
      subscription: {
        plan: company.subscription.plan,
        status: company.subscription.status,
        enterpriseCreditsPerUser: company.subscription.enterpriseAgentCreditsPerUser,
        agentCreditAnchorAt: company.subscription.agentCreditAnchorAt,
        trialEndDate: company.subscription.trialEndDate,
        currentPeriodEnd: company.subscription.currentPeriodEnd,
      },
      seats: { total: company._count.users, active: activeUsers },
      currentUtcMonth: usage,
    };
  }

  private async authVerificationByUserId(
    users: Array<{ id: string; companyId: string; email: string }>,
  ): Promise<Map<string, boolean>> {
    if (users.length === 0) return new Map();

    const authUsers = await this.prisma.authUser.findMany({
      where: {
        email: { in: users.map((user) => user.email), mode: "insensitive" },
      },
      select: { email: true, emailVerified: true, companyId: true },
    });
    const byEmail = new Map<string, typeof authUsers>();
    for (const authUser of authUsers) {
      const email = normalizeOperatorEmail(authUser.email);
      byEmail.set(email, [...(byEmail.get(email) ?? []), authUser]);
    }

    return new Map(
      users.map((user) => {
        const matches = byEmail.get(normalizeOperatorEmail(user.email)) ?? [];
        const verified = matches.length === 1 && matches[0].emailVerified && matches[0].companyId === user.companyId;
        return [user.id, verified];
      }),
    );
  }

  private mapUserBase(user: OperatorUserRecord, authEmailVerified: boolean) {
    const subscription = user.company.subscription;
    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      status: user.status,
      isPlatformOperator: user.isPlatformOperator,
      authEmailVerified,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      role: user.role,
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            quantity: subscription.quantity,
            billingProviderManaged: subscription.lemonSqueezyId !== null,
          }
        : null,
    };
  }

  private async userCreditPeriod(user: OperatorUserRecord, now: Date): Promise<OperatorUserCreditPeriodDto | null> {
    const subscription = user.company.subscription;
    if (!subscription) return null;

    const entitlement = resolveAgentCreditEntitlement({
      appMode: env.APP_MODE,
      plan: subscription.plan,
      status: subscription.status,
      trialEndDate: subscription.trialEndDate,
      creditAnchorAt: subscription.agentCreditAnchorAt ?? subscription.createdAt,
      enterpriseCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
      activeSeatAt: user.agentCreditActivatedAt,
      now,
    });
    const [adjustments, settled, reserved] = await Promise.all([
      this.prisma.agentCreditAdjustment.aggregate({
        where: {
          companyId: user.companyId,
          userId: user.id,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
        },
        _sum: { creditDelta: true },
      }),
      this.prisma.agentUsageEvent.aggregate({
        where: {
          companyId: user.companyId,
          userId: user.id,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
          state: "settled",
        },
        _sum: { chargedCredits: true },
      }),
      this.prisma.agentUsageEvent.aggregate({
        where: {
          companyId: user.companyId,
          userId: user.id,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
          state: { in: ["reserved", "retained"] },
        },
        _sum: { reservedCredits: true },
      }),
    ]);
    const adjustmentCredits = asSafeSignedCreditCount(
      adjustments._sum.creditDelta,
      "Hosted-AI credit adjustment total",
    );
    const rawEffectiveAllowance = entitlement.limit + adjustmentCredits;
    if (!Number.isSafeInteger(rawEffectiveAllowance)) throw new Error("Effective hosted-AI allowance is invalid.");

    const effectiveAllowanceCredits = Math.max(0, rawEffectiveAllowance);
    const chargedCredits = asSafeCreditCount(settled._sum.chargedCredits, "Charged hosted-AI credits");
    const reservedCredits = asSafeCreditCount(reserved._sum.reservedCredits, "Reserved hosted-AI credits");
    const committedCredits = addSafeCreditCounts(chargedCredits, reservedCredits, "Committed hosted-AI credits");

    return {
      periodStart: entitlement.start,
      periodEnd: entitlement.resetAt,
      baseAllowanceCredits: entitlement.limit,
      adjustmentCredits,
      effectiveAllowanceCredits,
      chargedCredits,
      reservedCredits,
      committedCredits,
      remainingCredits: Math.max(0, effectiveAllowanceCredits - committedCredits),
      overageCredits: Math.max(0, committedCredits - effectiveAllowanceCredits),
      blockedReason: user.status === Status.active ? entitlement.blockedReason : "subscription_unavailable",
    };
  }

  private async userDetailOrThrow(userId: string, now: Date): Promise<OperatorUserDetailDto> {
    const detail = await this.userDetail(userId, now);
    if (!detail) throw new Error("User not found after it was written.");

    return detail;
  }

  private async userDetail(userId: string, now: Date): Promise<OperatorUserDetailDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: operatorUserDetailSelect,
    });
    if (!user) return null;

    const [verification, creditPeriod] = await Promise.all([
      this.authVerificationByUserId([user]),
      this.userCreditPeriod(user, now),
    ]);
    const subscription = user.company.subscription;
    const statusRequiresProviderSeatSync = Boolean(subscription?.lemonSqueezyId);
    return {
      ...this.mapUserBase(user, verification.get(user.id) ?? false),
      updatedAt: user.updatedAt,
      agentCreditActivatedAt: user.agentCreditActivatedAt,
      isCurrentOperator: getOperatorActor().userId === user.id,
      statusMutation: {
        allowed: !statusRequiresProviderSeatSync,
        blockedReason: statusRequiresProviderSeatSync ? "provider_managed_seat_sync_required" : null,
      },
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            quantity: subscription.quantity,
            billingProviderManaged: subscription.lemonSqueezyId !== null,
            updatedAt: subscription.updatedAt,
            enterpriseCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
            agentCreditAnchorAt: subscription.agentCreditAnchorAt,
            trialEndDate: subscription.trialEndDate,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      creditPeriod,
    };
  }

  private async userCompanyId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!user) return null;
    return user.companyId;
  }

  @BypassTenantGuard
  async getOverviewUnscoped(now = new Date()): Promise<HostedAiOperatorOverviewDto | OperatorRefusal> {
    const month = utcMonth(now);
    const [companies, enterpriseCompanies, users, activeUsers, usage, companiesWithUsage] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.subscription.count({
        where: { plan: SubscriptionPlan.enterprise },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: Status.active } }),
      this.usageTotals(null, now),
      this.prisma.agentUsageEvent.findMany({
        where: {
          OR: [
            {
              state: "settled",
              settledAt: { gte: month.start, lt: month.end },
            },
            { state: { in: ["reserved", "retained"] } },
          ],
        },
        distinct: ["companyId"],
        select: { companyId: true },
      }),
    ]);

    const result: HostedAiOperatorOverviewDto = {
      generatedAt: now,
      currentUtcMonth: {
        periodStart: month.start,
        periodEnd: month.end,
        companiesWithUsage: companiesWithUsage.length,
        ...usage,
      },
      fleet: { companies, enterpriseCompanies, users, activeUsers },
      monthlySpendCapMicrocents: env.HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS?.toString() ?? null,
    };
    return result;
  }

  @BypassTenantGuard
  async getUserSummaryUnscoped(): Promise<OperatorUserSummaryDto> {
    const plans = Object.values(SubscriptionPlan);
    const subscriptionStatuses = Object.values(SubscriptionStatus);
    const [
      statusCounts,
      totalCompanies,
      platformOperators,
      verifiedRows,
      planCounts,
      subscriptionStatusCounts,
      missing,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.company.count(),
      this.prisma.user.count({ where: { isPlatformOperator: true } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS "count"
          FROM "User" AS domain_user
          JOIN "AuthUser" AS auth_user
            ON lower(auth_user."email") = lower(domain_user."email")
            AND auth_user."companyId" = domain_user."companyId"
            AND auth_user."emailVerified" = true
          WHERE (
            SELECT COUNT(*)
            FROM "AuthUser" AS candidate
            WHERE lower(candidate."email") = lower(domain_user."email")
          ) = 1
        `,
      Promise.all(
        plans.map((plan) =>
          this.prisma.user.count({
            where: { company: { subscription: { plan } } },
          }),
        ),
      ),
      Promise.all(
        subscriptionStatuses.map((status) =>
          this.prisma.user.count({
            where: { company: { subscription: { status } } },
          }),
        ),
      ),
      this.prisma.user.count({
        where: { company: { subscription: { is: null } } },
      }),
    ]);
    const summary = emptyUserSummary();
    for (const row of statusCounts) {
      summary.byStatus[row.status] = row._count._all;
      summary.totalUsers += row._count._all;
    }
    summary.totalCompanies = totalCompanies;
    summary.platformOperators = platformOperators;
    summary.verifiedAuthUsers = asSafeBigIntCount(verifiedRows[0]?.count, "Verified auth-user count");
    plans.forEach((plan, index) => {
      summary.byPlan[plan] = planCounts[index];
    });
    subscriptionStatuses.forEach((status, index) => {
      summary.bySubscriptionStatus[status] = subscriptionStatusCounts[index];
    });
    summary.byPlan.missing = missing;
    summary.bySubscriptionStatus.missing = missing;

    return summary;
  }

  @BypassTenantGuard
  async getUserDetailUnscoped(userId: string, now = new Date()): Promise<OperatorUserDetailDto | OperatorRefusal> {
    return (await this.userDetail(userId, now)) ?? "notFound";
  }

  @BypassTenantGuard
  async updateUserStatusUnscoped(
    data: UpdateOperatorUserStatusData,
    now = new Date(),
  ): Promise<OperatorUserDetailDto | OperatorRefusal> {
    const companyId = await this.userCompanyId(data.userId);
    if (!companyId) return "notFound";
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const target = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: {
            status: true,
            role: { select: { isSystemRole: true } },
            company: {
              select: {
                subscription: {
                  select: { plan: true, lemonSqueezyId: true },
                },
              },
            },
          },
        });
        if (!target) return "notFound";

        if (actor.userId === data.userId && data.status !== Status.active) return "conflict";

        const statusChanged = target.status !== data.status;
        const subscription = target.company.subscription;
        if (statusChanged && subscription?.lemonSqueezyId) return "conflict";

        const leavingActive = target.status === Status.active && data.status !== Status.active;
        if (leavingActive && target.role?.isSystemRole) {
          const otherActiveSystemUsers = await this.prisma.user.count({
            where: {
              companyId,
              id: { not: data.userId },
              status: Status.active,
              role: { isSystemRole: true },
            },
          });
          if (otherActiveSystemUsers === 0) return "conflict";
        }

        const enteringActive = target.status !== Status.active && data.status === Status.active;
        await this.prisma.user.update({
          where: { id: data.userId, companyId },
          data: {
            status: data.status,
            ...(enteringActive ? { agentCreditActivatedAt: now } : {}),
            ...(leavingActive ? { agentCreditActivatedAt: null } : {}),
          },
        });
        if (target.status === Status.pendingAuthorization && data.status !== Status.pendingAuthorization) {
          await this.prisma.task.deleteMany({
            where: {
              companyId,
              relatedUserId: data.userId,
              type: TaskType.userPendingAuthorization,
            },
          });
        }
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.userStatusUpdate,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          reason,
          metadata: {
            previousStatus: target.status,
            nextStatus: data.status,
          },
        });
        return this.userDetailOrThrow(data.userId, now);
      },
      { companyId },
    );
  }

  @BypassTenantGuard
  async updateUserPlatformAccessUnscoped(
    data: UpdateOperatorUserPlatformAccessData,
    now = new Date(),
  ): Promise<OperatorUserDetailDto | OperatorRefusal> {
    const companyId = await this.userCompanyId(data.userId);
    if (!companyId) return "notFound";
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const target = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: { id: true, email: true, status: true, updatedAt: true, isPlatformOperator: true },
        });
        if (!target) return "notFound";

        if (actor.userId === data.userId) return "conflict";

        if (data.isPlatformOperator) {
          if (target.status !== Status.active) return "conflict";

          const email = normalizeOperatorEmail(target.email);
          const domainUsers = await this.prisma.user.count({
            where: { email: { equals: email, mode: "insensitive" } },
          });
          if (domainUsers !== 1) return "conflict";

          const authUsers = await this.prisma.authUser.findMany({
            where: { email: { equals: email, mode: "insensitive" } },
            take: 2,
            select: { companyId: true, emailVerified: true },
          });
          if (authUsers.length !== 1) return "conflict";
          if (!authUsers[0].emailVerified) return "conflict";
          if (authUsers[0].companyId !== companyId) return "conflict";
        } else if (target.isPlatformOperator) {
          const otherActiveOperators = await this.prisma.user.count({
            where: { id: { not: data.userId }, isPlatformOperator: true, status: Status.active },
          });
          if (otherActiveOperators === 0) return "conflict";
        }

        await this.prisma.user.update({
          where: { id: data.userId, companyId },
          data: { isPlatformOperator: data.isPlatformOperator },
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          reason,
          metadata: {
            previousIsPlatformOperator: target.isPlatformOperator,
            nextIsPlatformOperator: data.isPlatformOperator,
          },
        });
        return this.userDetailOrThrow(data.userId, now);
      },
      { companyId },
    );
  }

  @BypassTenantGuard
  async correctSubscriptionSnapshotUnscoped(
    data: CorrectOperatorSubscriptionSnapshotData,
    now = new Date(),
  ): Promise<OperatorUserDetailDto | OperatorRefusal> {
    const companyId = await this.userCompanyId(data.userId);
    if (!companyId) return "notFound";
    return runInTransaction(
      async () => {
        const reason = data.reason ?? null;
        const target = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: { id: true },
        });
        if (!target) return "notFound";

        const subscription = await this.prisma.subscription.findUnique({
          where: { companyId },
        });
        if (!subscription) return "notFound";

        const previous = {
          plan: subscription.plan,
          status: subscription.status,
          quantity: subscription.quantity,
        };
        const next = {
          plan: data.plan,
          status: data.status,
          quantity: data.quantity,
        };
        const billingProviderManaged = subscription.lemonSqueezyId !== null;

        await this.prisma.subscription.update({
          where: { companyId },
          data: next,
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.subscriptionSnapshotCorrect,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          reason,
          metadata: {
            previous,
            next,
            billingProviderManaged,
          },
        });
        return this.userDetailOrThrow(data.userId, now);
      },
      { companyId },
    );
  }

  @BypassTenantGuard
  async updateEnterpriseAllowanceUnscoped(
    data: UpdateHostedAiEnterpriseAllowanceData,
    now = new Date(),
  ): Promise<HostedAiOperatorCompanyDto | OperatorRefusal> {
    return runInTransaction(
      async () => {
        const reason = data.reason ?? null;

        const subscription = await this.prisma.subscription.findUnique({
          where: { companyId: data.companyId },
        });
        if (!subscription) return "notFound";
        if (subscription.plan !== SubscriptionPlan.enterprise) return "conflict";

        await this.prisma.subscription.update({
          where: { companyId: data.companyId },
          data: { enterpriseAgentCreditsPerUser: data.creditsPerUser },
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.enterpriseAllowanceUpdate,
          targetCompanyId: data.companyId,
          reason,
          metadata: {
            creditsPerUser: data.creditsPerUser,
            previousCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
          },
        });

        const result = await this.companySnapshot(data.companyId, now);
        if (!result) throw new Error("Updated Enterprise subscription could not be read.");
        return result;
      },
      { companyId: data.companyId },
    );
  }

  @BypassTenantGuard
  async createCreditAdjustmentUnscoped(
    data: CreateAgentCreditAdjustmentData,
    now = new Date(),
  ): Promise<AgentCreditAdjustmentDto | OperatorRefusal> {
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const periodStart = new Date(data.periodStart);
        const periodEnd = new Date(data.periodEnd);
        const existing = await this.prisma.agentCreditAdjustment.findUnique({
          where: { operationId: data.operationId },
        });
        if (existing) {
          if (
            existing.companyId !== data.companyId ||
            existing.userId !== data.userId ||
            existing.creditDelta !== data.creditDelta ||
            existing.periodStart.getTime() !== periodStart.getTime() ||
            existing.periodEnd.getTime() !== periodEnd.getTime() ||
            existing.reason !== reason ||
            existing.createdByOperatorUserId !== actor.userId
          )
            return "conflict";

          return existing;
        }

        const user = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId: data.companyId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            agentCreditActivatedAt: true,
            company: { select: { subscription: true } },
          },
        });
        if (!user) return "notFound";
        if (user.status !== Status.active) return "conflict";

        const subscription = user.company.subscription;
        if (!subscription) return "unavailable";

        const entitlement = resolveAgentCreditEntitlement({
          appMode: env.APP_MODE,
          plan: subscription.plan,
          status: subscription.status,
          trialEndDate: subscription.trialEndDate,
          creditAnchorAt: subscription.agentCreditAnchorAt ?? subscription.createdAt,
          enterpriseCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
          activeSeatAt: user.agentCreditActivatedAt,
          now,
        });
        if (entitlement.blockedReason === "enterprise_allowance_missing") return "allowanceMissing";
        if (entitlement.blockedReason) return "conflict";

        if (
          entitlement.start.getTime() !== periodStart.getTime() ||
          entitlement.resetAt.getTime() !== periodEnd.getTime()
        )
          return "conflict";

        const [adjustmentAggregate, settledAggregate, reservedAggregate] = await Promise.all([
          this.prisma.agentCreditAdjustment.aggregate({
            where: {
              companyId: data.companyId,
              userId: data.userId,
              periodStart,
              periodEnd,
            },
            _sum: { creditDelta: true },
          }),
          this.prisma.agentUsageEvent.aggregate({
            where: {
              companyId: data.companyId,
              userId: data.userId,
              periodStart,
              periodEnd,
              state: "settled",
            },
            _sum: { chargedCredits: true },
          }),
          this.prisma.agentUsageEvent.aggregate({
            where: {
              companyId: data.companyId,
              userId: data.userId,
              periodStart,
              periodEnd,
              state: { in: ["reserved", "retained"] },
            },
            _sum: { reservedCredits: true },
          }),
        ]);
        const priorAdjustments = asSafeSignedCreditCount(
          adjustmentAggregate._sum.creditDelta,
          "Hosted-AI credit adjustment total",
        );
        const committed =
          asSafeCreditCount(settledAggregate._sum.chargedCredits, "Charged hosted-AI credits") +
          asSafeCreditCount(reservedAggregate._sum.reservedCredits, "Reserved hosted-AI credits");
        const effectiveAllowance = entitlement.limit + priorAdjustments + data.creditDelta;
        if (!Number.isSafeInteger(effectiveAllowance) || effectiveAllowance < committed) return "conflict";

        const adjustment = await this.prisma.agentCreditAdjustment.create({
          data: {
            companyId: data.companyId,
            userId: data.userId,
            creditDelta: data.creditDelta,
            periodStart,
            periodEnd,
            reason,
            operationId: data.operationId,
            createdByOperatorUserId: actor.userId,
          },
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.creditAdjustmentCreate,
          targetCompanyId: data.companyId,
          targetUserId: data.userId,
          reason,
          metadata: {
            creditDelta: data.creditDelta,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
          },
        });
        return adjustment;
      },
      { companyId: data.companyId },
    );
  }

  @BypassTenantGuard
  async resetUserCreditsUnscoped(
    data: ResetOperatorUserCreditsData,
    now = new Date(),
  ): Promise<ResetOperatorUserCreditsResultDto | OperatorRefusal> {
    const companyId = await this.userCompanyId(data.userId);
    if (!companyId) return "notFound";
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const existing = await this.prisma.agentCreditAdjustment.findUnique({
          where: { operationId: data.operationId },
        });
        if (existing) {
          return {
            adjustment: existing,
            user: await this.userDetailOrThrow(data.userId, now),
          };
        }

        const user = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: operatorUserDetailSelect,
        });
        if (!user) return "notFound";
        if (user.status !== Status.active) return "conflict";
        if (!user.company.subscription) return "unavailable";

        const credit = await this.userCreditPeriod(user, now);
        if (!credit) return "unavailable";
        if (credit.blockedReason === "enterprise_allowance_missing") return "allowanceMissing";
        const currentAllowance = credit.baseAllowanceCredits + credit.adjustmentCredits;
        if (!Number.isSafeInteger(currentAllowance)) throw new Error("Current hosted-AI allowance is invalid.");

        const creditDelta =
          data.mode === "baseAllowance" ? -credit.adjustmentCredits : credit.committedCredits - currentAllowance;
        if (!Number.isSafeInteger(creditDelta) || Math.abs(creditDelta) > MAX_ADJUSTMENT_CREDITS) return "conflict";

        if (creditDelta === 0) return "conflict";

        const resultingAllowance = currentAllowance + creditDelta;
        if (!Number.isSafeInteger(resultingAllowance) || resultingAllowance < credit.committedCredits)
          return "conflict";

        const adjustment = await this.prisma.agentCreditAdjustment.create({
          data: {
            companyId,
            userId: data.userId,
            creditDelta,
            periodStart: credit.periodStart,
            periodEnd: credit.periodEnd,
            reason,
            operationId: data.operationId,
            createdByOperatorUserId: actor.userId,
          },
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.creditBalanceReset,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          reason,
          metadata: {
            mode: data.mode,
            periodStart: credit.periodStart.toISOString(),
            periodEnd: credit.periodEnd.toISOString(),
            baseAllowanceCredits: credit.baseAllowanceCredits,
            previousAdjustmentCredits: credit.adjustmentCredits,
            committedCredits: credit.committedCredits,
            creditDelta,
            resultingAllowanceCredits: resultingAllowance,
          },
        });
        return {
          adjustment: adjustment,
          user: await this.userDetailOrThrow(data.userId, now),
        };
      },
      { companyId },
    );
  }

  @BypassTenantGuard
  async deleteWorkspaceUnscoped(
    data: DeleteOperatorWorkspaceData,
  ): Promise<DeleteOperatorWorkspaceResultDto | OperatorRefusal> {
    const actor = getOperatorActor();
    if (actor.companyId === data.companyId) return "conflict";

    return runInTransaction(
      async () => {
        const company = await this.prisma.company.findUnique({
          where: { id: data.companyId },
          select: {
            id: true,
            users: { select: { id: true, email: true, status: true, isPlatformOperator: true } },
            subscription: { select: { plan: true, status: true, lemonSqueezyId: true } },
          },
        });
        if (!company) return "notFound";

        const workspaceLabel = workspaceLabelFor(company.id, company.users);
        if (data.confirmWorkspaceLabel !== workspaceLabel) return "conflict";
        if (company.users.some((member) => member.isPlatformOperator && member.status === Status.active))
          return "conflict";

        const memberIds = company.users.map((member) => member.id);
        const memberEmails = company.users.map((member) => member.email);

        await this.prisma.inviteToken.deleteMany({ where: { createdById: { in: memberIds } } });

        const identities = await this.prisma.authUser.findMany({
          where: { email: { in: memberEmails } },
          select: { id: true },
        });
        const identityIds = identities.map((identity) => identity.id);
        await this.prisma.apikey.deleteMany({ where: { referenceId: { in: identityIds } } });
        await this.prisma.authUser.deleteMany({ where: { id: { in: identityIds } } });

        await this.prisma.company.delete({ where: { id: data.companyId } });

        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.workspaceDelete,
          targetCompanyId: data.companyId,
          reason: data.reason,
          metadata: {
            workspaceLabel,
            deletedMemberCount: memberIds.length,
            deletedAuthIdentityCount: identityIds.length,
            plan: company.subscription?.plan ?? null,
            subscriptionStatus: company.subscription?.status ?? null,
            billingSubscriptionLeftActive: Boolean(company.subscription?.lemonSqueezyId),
          },
        });

        return {
          companyId: data.companyId,
          workspaceLabel,
          deletedMemberCount: memberIds.length,
          deletedAuthIdentityCount: identityIds.length,
        };
      },
      { companyId: data.companyId },
    );
  }
}
