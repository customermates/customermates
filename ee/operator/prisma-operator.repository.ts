import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma";
import { Status, SubscriptionPlan, SubscriptionStatus, TaskType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { getOperatorActor } from "@/core/decorators/operator-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AGENT_CREDIT_MICROCENTS, resolveAgentCreditEntitlement } from "@/ee/agent-chat/agent-credit-policy";
import { env } from "@/env";

import { OperatorConfigurationError, OperatorConflictError, OperatorNotFoundError } from "./operator.errors";
import { normalizeOperatorEmail } from "./operator-access.service";
import type { OperatorRepo, PublishOperatorUserStatusChanged } from "./operator.repo";
import {
  OPERATOR_AUDIT_ACTION,
  type AgentCreditAdjustmentDto,
  type CorrectOperatorSubscriptionSnapshotData,
  type CreateAgentCreditAdjustmentData,
  type HostedAiGlobalControlDto,
  type HostedAiOperatorCandidateDto,
  type HostedAiOperatorCompanyDto,
  type HostedAiOperatorOverviewDto,
  type HostedAiUsageTotalsDto,
  type OperatorAuditPageDto,
  type OperatorUserCreditPeriodDto,
  type OperatorUserDetailDto,
  type OperatorUserListItemDto,
  type OperatorUserPageDto,
  type OperatorUserSummaryDto,
  type ParsedListOperatorUsersData,
  type ResetOperatorUserCreditsData,
  type ResetOperatorUserCreditsResultDto,
  type UpdateHostedAiEnterpriseAllowanceData,
  type UpdateHostedAiGlobalControlData,
  type UpdateOperatorUserPlatformAccessData,
  type UpdateOperatorUserStatusData,
} from "./operator.schema";

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

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function asSafeCreditCount(value: number | null | undefined, description: string): number {
  const count = value ?? 0;
  if (!Number.isSafeInteger(count) || count < 0) throw new OperatorConfigurationError(`${description} is invalid.`);
  return count;
}

function asSafeSignedCreditCount(value: number | null | undefined, description: string): number {
  const count = value ?? 0;
  if (!Number.isSafeInteger(count)) throw new OperatorConfigurationError(`${description} is invalid.`);
  return count;
}

function addSafeCreditCounts(left: number, right: number, description: string): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new OperatorConfigurationError(`${description} is invalid.`);
  return total;
}

function asSafeBigIntCount(value: bigint | null | undefined, description: string): number {
  const count = value ?? 0n;
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER))
    throw new OperatorConfigurationError(`${description} is invalid.`);
  return Number(count);
}

function operatorUserOrderBy(sort: ParsedListOperatorUsersData["sort"]): Prisma.UserOrderByWithRelationInput[] {
  if (sort === "oldest") return [{ createdAt: "asc" }, { id: "asc" }];
  if (sort === "emailAsc") return [{ email: "asc" }, { id: "asc" }];
  if (sort === "emailDesc") return [{ email: "desc" }, { id: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

function operatorUserSearchWhere(query: string): Prisma.UserWhereInput {
  const nameTokens = query.split(/\s+/u);

  return {
    OR: [
      { email: { contains: query, mode: "insensitive" } },
      {
        AND: nameTokens.map((token) => ({
          OR: [
            { firstName: { contains: token, mode: "insensitive" } },
            { lastName: { contains: token, mode: "insensitive" } },
          ],
        })),
      },
    ],
  };
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
  if (settled < 0n) throw new OperatorConfigurationError("Settled hosted-AI cost is invalid.");

  const reservedExposure = BigInt(reservedCredits) * BigInt(AGENT_CREDIT_MICROCENTS);
  return {
    settledCostMicrocents: settled.toString(),
    reservedExposureMicrocents: reservedExposure.toString(),
    totalCommittedMicrocents: (settled + reservedExposure).toString(),
    chargedCredits,
    reservedCredits,
  };
}

function mapGlobalControl(control: {
  id: string;
  hostedProviderWorkPaused: boolean;
  monthlySpendCapMicrocents: bigint | null;
  reason: string;
  version: number;
  updatedByOperatorUserId: string;
  createdAt: Date;
  updatedAt: Date;
}): HostedAiGlobalControlDto {
  if (control.id !== "global") throw new OperatorConfigurationError("Hosted-AI global control is malformed.");

  return {
    id: "global",
    hostedProviderWorkPaused: control.hostedProviderWorkPaused,
    monthlySpendCapMicrocents: control.monthlySpendCapMicrocents?.toString() ?? null,
    reason: control.reason,
    version: control.version,
    updatedByOperatorUserId: control.updatedByOperatorUserId,
    createdAt: control.createdAt.toISOString(),
    updatedAt: control.updatedAt.toISOString(),
  };
}

function mapAdjustment(adjustment: {
  id: string;
  companyId: string;
  userId: string;
  creditDelta: number;
  periodStart: Date;
  periodEnd: Date;
  reason: string | null;
  operationId: string;
  createdByOperatorUserId: string;
  createdAt: Date;
}): AgentCreditAdjustmentDto {
  return {
    ...adjustment,
    periodStart: adjustment.periodStart.toISOString(),
    periodEnd: adjustment.periodEnd.toISOString(),
    createdAt: adjustment.createdAt.toISOString(),
  };
}

export class PrismaOperatorRepo extends BaseRepository implements OperatorRepo {
  private async createAudit(args: {
    action: AuditAction;
    targetCompanyId?: string | null;
    targetUserId?: string | null;
    operationId?: string;
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
        operationId: args.operationId ?? randomUUID(),
        reason: args.reason ?? null,
        metadata: args.metadata,
      },
    });
  }

  private async getGlobalControlOrThrow() {
    const control = await this.prisma.hostedAiGlobalControl.findUnique({
      where: { id: "global" },
    });
    if (!control) throw new OperatorConfigurationError("Hosted-AI global control is not configured.");
    return control;
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
        agentCreditAnchorAt: toIso(company.subscription.agentCreditAnchorAt),
        trialEndDate: toIso(company.subscription.trialEndDate),
        currentPeriodEnd: toIso(company.subscription.currentPeriodEnd),
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

  private mapUserListItem(user: OperatorUserRecord, authEmailVerified: boolean): OperatorUserListItemDto {
    const subscription = user.company.subscription;
    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      status: user.status,
      isPlatformOperator: user.isPlatformOperator,
      authEmailVerified,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: toIso(user.lastActiveAt),
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
    if (!Number.isSafeInteger(rawEffectiveAllowance))
      throw new OperatorConfigurationError("Effective hosted-AI allowance is invalid.");

    const effectiveAllowanceCredits = Math.max(0, rawEffectiveAllowance);
    const chargedCredits = asSafeCreditCount(settled._sum.chargedCredits, "Charged hosted-AI credits");
    const reservedCredits = asSafeCreditCount(reserved._sum.reservedCredits, "Reserved hosted-AI credits");
    const committedCredits = addSafeCreditCounts(chargedCredits, reservedCredits, "Committed hosted-AI credits");

    return {
      periodStart: entitlement.start.toISOString(),
      periodEnd: entitlement.resetAt.toISOString(),
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: operatorUserDetailSelect,
    });
    if (!user) throw new OperatorNotFoundError("User not found.");

    const [verification, creditPeriod] = await Promise.all([
      this.authVerificationByUserId([user]),
      this.userCreditPeriod(user, now),
    ]);
    const subscription = user.company.subscription;
    const statusRequiresProviderSeatSync = Boolean(subscription?.lemonSqueezyId);
    return {
      ...this.mapUserListItem(user, verification.get(user.id) ?? false),
      updatedAt: user.updatedAt.toISOString(),
      agentCreditActivatedAt: toIso(user.agentCreditActivatedAt),
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
            updatedAt: subscription.updatedAt.toISOString(),
            enterpriseCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
            agentCreditAnchorAt: toIso(subscription.agentCreditAnchorAt),
            trialEndDate: toIso(subscription.trialEndDate),
            currentPeriodEnd: toIso(subscription.currentPeriodEnd),
          }
        : null,
      creditPeriod,
    };
  }

  private async userCompanyIdOrThrow(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!user) throw new OperatorNotFoundError("User not found.");
    return user.companyId;
  }

  @BypassTenantGuard
  async getOverviewAuditedUnscoped(now = new Date()): Promise<HostedAiOperatorOverviewDto> {
    return runInTransaction(async () => {
      const month = utcMonth(now);
      const [control, companies, enterpriseCompanies, users, activeUsers, usage, companiesWithUsage] =
        await Promise.all([
          this.getGlobalControlOrThrow(),
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
        generatedAt: now.toISOString(),
        currentUtcMonth: {
          periodStart: month.start.toISOString(),
          periodEnd: month.end.toISOString(),
          companiesWithUsage: companiesWithUsage.length,
          ...usage,
        },
        fleet: { companies, enterpriseCompanies, users, activeUsers },
        globalControl: mapGlobalControl(control),
      };
      return result;
    });
  }

  @BypassTenantGuard
  async findCandidateAuditedUnscoped(
    normalizedEmail: string,
    now = new Date(),
  ): Promise<HostedAiOperatorCandidateDto | null> {
    return runInTransaction(async () => {
      const users = await this.prisma.user.findMany({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        take: 2,
        select: {
          id: true,
          companyId: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          agentCreditActivatedAt: true,
          company: {
            select: {
              subscription: {
                select: {
                  plan: true,
                  status: true,
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
      if (users.length > 1) throw new OperatorConflictError("The normalized email matches multiple users.");

      const user = users[0];
      if (!user) return null;

      const [authUsers, company] = await Promise.all([
        this.prisma.authUser.findMany({
          where: { email: { equals: normalizedEmail, mode: "insensitive" } },
          take: 2,
          select: { emailVerified: true, companyId: true },
        }),
        this.companySnapshot(user.companyId, now),
      ]);
      if (authUsers.length > 1) throw new OperatorConflictError("The normalized email matches multiple auth users.");
      if (!company) throw new OperatorConfigurationError("The candidate company has no subscription.");

      let creditPeriod: HostedAiOperatorCandidateDto["creditPeriod"] = null;
      const subscription = user.company.subscription;
      if (subscription) {
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
        if (!Number.isSafeInteger(rawEffectiveAllowance))
          throw new OperatorConfigurationError("Effective hosted-AI allowance is invalid.");

        const effectiveAllowanceCredits = Math.max(0, rawEffectiveAllowance);

        const chargedCredits = asSafeCreditCount(settled._sum.chargedCredits, "Charged hosted-AI credits");
        const reservedCredits = asSafeCreditCount(reserved._sum.reservedCredits, "Reserved hosted-AI credits");
        const committedCredits = addSafeCreditCounts(chargedCredits, reservedCredits, "Committed hosted-AI credits");

        creditPeriod = {
          periodStart: entitlement.start.toISOString(),
          periodEnd: entitlement.resetAt.toISOString(),
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

      const candidate: HostedAiOperatorCandidateDto = {
        userId: user.id,
        companyId: user.companyId,
        email: user.email,
        displayName: `${user.firstName} ${user.lastName}`.trim(),
        status: user.status,
        authEmailVerified:
          authUsers.length === 1 && authUsers[0].emailVerified && authUsers[0].companyId === user.companyId,
        company,
        creditPeriod,
      };
      return candidate;
    });
  }

  @BypassTenantGuard
  async getCompanyAuditedOrThrowUnscoped(companyId: string, now = new Date()): Promise<HostedAiOperatorCompanyDto> {
    return runInTransaction(async () => {
      const company = await this.companySnapshot(companyId, now);
      if (!company) throw new OperatorNotFoundError("Company or subscription not found.");

      return company;
    });
  }

  @BypassTenantGuard
  async listUsersAuditedUnscoped(data: ParsedListOperatorUsersData): Promise<OperatorUserPageDto> {
    return runInTransaction(async () => {
      const subscriptionFilter =
        data.subscriptionPlan || data.subscriptionStatus
          ? {
              company: {
                subscription: {
                  ...(data.subscriptionPlan ? { plan: data.subscriptionPlan } : {}),
                  ...(data.subscriptionStatus ? { status: data.subscriptionStatus } : {}),
                },
              },
            }
          : {};
      const where: Prisma.UserWhereInput = {
        ...(data.query ? operatorUserSearchWhere(data.query) : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.isPlatformOperator === undefined ? {} : { isPlatformOperator: data.isPlatformOperator }),
        ...subscriptionFilter,
      };
      const [rows, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          ...(data.cursor ? { cursor: { id: data.cursor }, skip: 1 } : {}),
          take: data.limit + 1,
          orderBy: operatorUserOrderBy(data.sort),
          select: operatorUserDetailSelect,
        }),
        this.prisma.user.count({ where }),
      ]);
      const hasMore = rows.length > data.limit;
      const visible = hasMore ? rows.slice(0, data.limit) : rows;
      const verification = await this.authVerificationByUserId(visible);
      const users = visible.map((user) => this.mapUserListItem(user, verification.get(user.id) ?? false));

      return {
        users,
        nextCursor: hasMore ? (visible.at(-1)?.id ?? null) : null,
        total,
      };
    });
  }

  @BypassTenantGuard
  async getUserSummaryAuditedUnscoped(): Promise<OperatorUserSummaryDto> {
    return runInTransaction(async () => {
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
    });
  }

  @BypassTenantGuard
  async getUserDetailAuditedOrThrowUnscoped(userId: string, now = new Date()): Promise<OperatorUserDetailDto> {
    return runInTransaction(async () => {
      const detail = await this.userDetailOrThrow(userId, now);
      return detail;
    });
  }

  @BypassTenantGuard
  async updateUserStatusOrThrowUnscoped(
    data: UpdateOperatorUserStatusData,
    publishUserUpdated: PublishOperatorUserStatusChanged,
    now = new Date(),
  ): Promise<OperatorUserDetailDto> {
    const companyId = await this.userCompanyIdOrThrow(data.userId);
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const target = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            country: true,
            avatarUrl: true,
            roleId: true,
            status: true,
            updatedAt: true,
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
        if (!target) throw new OperatorNotFoundError("User not found.");

        const prior = await this.prisma.operatorAuditEvent.findUnique({
          where: { operationId: data.operationId },
        });
        if (prior) {
          const metadata = prior.metadata as Record<string, unknown> | null;
          if (
            prior.actorUserId !== actor.userId ||
            prior.action !== OPERATOR_AUDIT_ACTION.userStatusUpdate ||
            prior.targetCompanyId !== companyId ||
            prior.targetUserId !== data.userId ||
            prior.reason !== reason ||
            metadata?.expectedUpdatedAt !== data.expectedUpdatedAt ||
            metadata?.nextStatus !== data.status
          )
            throw new OperatorConflictError("The operation ID was already used for another request.");

          return this.userDetailOrThrow(data.userId, now);
        }

        if (target.updatedAt.toISOString() !== data.expectedUpdatedAt)
          throw new OperatorConflictError("The user changed. Refresh before updating their status.");

        if (actor.userId === data.userId && data.status !== Status.active)
          throw new OperatorConflictError("An operator cannot deactivate or suspend their own account.");

        const statusChanged = target.status !== data.status;
        const subscription = target.company.subscription;
        if (statusChanged && subscription?.lemonSqueezyId) {
          throw new OperatorConflictError(
            "Provider-managed seat status must be changed through the tenant billing flow.",
          );
        }

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
          if (otherActiveSystemUsers === 0)
            throw new OperatorConflictError("The company must retain at least one active system-role user.");
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
        if (statusChanged) {
          await publishUserUpdated({
            companyId,
            userId: data.userId,
            firstName: target.firstName,
            lastName: target.lastName,
            country: target.country,
            status: data.status,
            avatarUrl: target.avatarUrl,
            roleId: target.roleId,
          });
        }
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.userStatusUpdate,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          operationId: data.operationId,
          reason,
          metadata: {
            expectedUpdatedAt: data.expectedUpdatedAt,
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
  async updateUserPlatformAccessOrThrowUnscoped(
    data: UpdateOperatorUserPlatformAccessData,
    now = new Date(),
  ): Promise<OperatorUserDetailDto> {
    const companyId = await this.userCompanyIdOrThrow(data.userId);
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const target = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: { id: true, email: true, status: true, updatedAt: true, isPlatformOperator: true },
        });
        if (!target) throw new OperatorNotFoundError("User not found.");

        const prior = await this.prisma.operatorAuditEvent.findUnique({
          where: { operationId: data.operationId },
        });
        if (prior) {
          const metadata = prior.metadata as Record<string, unknown> | null;
          if (
            prior.actorUserId !== actor.userId ||
            prior.action !== OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate ||
            prior.targetCompanyId !== companyId ||
            prior.targetUserId !== data.userId ||
            prior.reason !== reason ||
            metadata?.expectedUpdatedAt !== data.expectedUpdatedAt ||
            metadata?.nextIsPlatformOperator !== data.isPlatformOperator
          )
            throw new OperatorConflictError("The operation ID was already used for another request.");

          return this.userDetailOrThrow(data.userId, now);
        }

        if (target.updatedAt.toISOString() !== data.expectedUpdatedAt)
          throw new OperatorConflictError("The user changed. Refresh before updating their platform access.");

        if (actor.userId === data.userId)
          throw new OperatorConflictError("An operator cannot change their own platform access.");

        if (data.isPlatformOperator) {
          if (target.status !== Status.active)
            throw new OperatorConflictError("Only an active user can hold platform operator access.");

          const email = normalizeOperatorEmail(target.email);
          const domainUsers = await this.prisma.user.count({
            where: { email: { equals: email, mode: "insensitive" } },
          });
          if (domainUsers !== 1) throw new OperatorConflictError("The normalized email matches multiple users.");

          const authUsers = await this.prisma.authUser.findMany({
            where: { email: { equals: email, mode: "insensitive" } },
            take: 2,
            select: { companyId: true, emailVerified: true },
          });
          if (authUsers.length !== 1)
            throw new OperatorConflictError("The normalized email must match exactly one auth user.");
          if (!authUsers[0].emailVerified) throw new OperatorConflictError("The user's email must be verified.");
          if (authUsers[0].companyId !== companyId)
            throw new OperatorConflictError("The auth and domain users do not belong to the same company.");
        } else if (target.isPlatformOperator) {
          const otherActiveOperators = await this.prisma.user.count({
            where: { id: { not: data.userId }, isPlatformOperator: true, status: Status.active },
          });
          if (otherActiveOperators === 0)
            throw new OperatorConflictError("The platform must retain at least one active operator.");
        }

        await this.prisma.user.update({
          where: { id: data.userId, companyId },
          data: { isPlatformOperator: data.isPlatformOperator },
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          operationId: data.operationId,
          reason,
          metadata: {
            expectedUpdatedAt: data.expectedUpdatedAt,
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
  async correctSubscriptionSnapshotOrThrowUnscoped(
    data: CorrectOperatorSubscriptionSnapshotData,
    now = new Date(),
  ): Promise<OperatorUserDetailDto> {
    const companyId = await this.userCompanyIdOrThrow(data.userId);
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const target = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: { id: true },
        });
        if (!target) throw new OperatorNotFoundError("User not found.");

        const prior = await this.prisma.operatorAuditEvent.findUnique({
          where: { operationId: data.operationId },
        });
        if (prior) {
          const metadata = prior.metadata as Record<string, unknown> | null;
          const next = metadata?.next as Record<string, unknown> | undefined;
          if (
            prior.actorUserId !== actor.userId ||
            prior.action !== OPERATOR_AUDIT_ACTION.subscriptionSnapshotCorrect ||
            prior.targetCompanyId !== companyId ||
            prior.targetUserId !== data.userId ||
            prior.reason !== reason ||
            metadata?.expectedUpdatedAt !== data.expectedUpdatedAt ||
            next?.plan !== data.plan ||
            next?.status !== data.status ||
            next?.quantity !== data.quantity
          )
            throw new OperatorConflictError("The operation ID was already used for another request.");

          return this.userDetailOrThrow(data.userId, now);
        }

        const subscription = await this.prisma.subscription.findUnique({
          where: { companyId },
        });
        if (!subscription) throw new OperatorNotFoundError("Company subscription not found.");
        if (subscription.updatedAt.toISOString() !== data.expectedUpdatedAt)
          throw new OperatorConflictError("The subscription changed. Refresh before correcting its snapshot.");

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
          operationId: data.operationId,
          reason,
          metadata: {
            expectedUpdatedAt: data.expectedUpdatedAt,
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
  async updateEnterpriseAllowanceOrThrowUnscoped(
    data: UpdateHostedAiEnterpriseAllowanceData,
    now = new Date(),
  ): Promise<HostedAiOperatorCompanyDto> {
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const prior = await this.prisma.operatorAuditEvent.findUnique({
          where: { operationId: data.operationId },
        });
        if (prior) {
          const metadata = prior.metadata as Record<string, unknown> | null;
          if (
            prior.actorUserId !== actor.userId ||
            prior.action !== OPERATOR_AUDIT_ACTION.enterpriseAllowanceUpdate ||
            prior.targetCompanyId !== data.companyId ||
            prior.reason !== reason ||
            metadata?.creditsPerUser !== data.creditsPerUser
          )
            throw new OperatorConflictError("The operation ID was already used for another request.");

          const replay = await this.companySnapshot(data.companyId, now);
          if (!replay) throw new OperatorNotFoundError("Company or subscription not found.");
          return replay;
        }

        const subscription = await this.prisma.subscription.findUnique({
          where: { companyId: data.companyId },
        });
        if (!subscription) throw new OperatorNotFoundError("Company subscription not found.");
        if (subscription.plan !== SubscriptionPlan.enterprise)
          throw new OperatorConflictError("Enterprise allowance can only be set for an Enterprise subscription.");

        await this.prisma.subscription.update({
          where: { companyId: data.companyId },
          data: { enterpriseAgentCreditsPerUser: data.creditsPerUser },
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.enterpriseAllowanceUpdate,
          targetCompanyId: data.companyId,
          operationId: data.operationId,
          reason,
          metadata: {
            creditsPerUser: data.creditsPerUser,
            previousCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
          },
        });

        const result = await this.companySnapshot(data.companyId, now);
        if (!result) throw new OperatorConfigurationError("Updated Enterprise subscription could not be read.");
        return result;
      },
      { companyId: data.companyId },
    );
  }

  @BypassTenantGuard
  async createCreditAdjustmentOrThrowUnscoped(
    data: CreateAgentCreditAdjustmentData,
    now = new Date(),
  ): Promise<AgentCreditAdjustmentDto> {
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
            throw new OperatorConflictError("The operation ID was already used for another adjustment.");

          return mapAdjustment(existing);
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
        if (!user) throw new OperatorNotFoundError("User was not found in the selected company.");
        if (user.status !== Status.active)
          throw new OperatorConflictError("Credit adjustments require an active user.");

        const subscription = user.company.subscription;
        if (!subscription) throw new OperatorConfigurationError("The selected company has no subscription.");

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
        if (entitlement.blockedReason)
          throw new OperatorConflictError(`Hosted-AI credits are blocked: ${entitlement.blockedReason}.`);

        if (
          entitlement.start.getTime() !== periodStart.getTime() ||
          entitlement.resetAt.getTime() !== periodEnd.getTime()
        )
          throw new OperatorConflictError("The adjustment must target the user's current credit period.");

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
        if (!Number.isSafeInteger(effectiveAllowance) || effectiveAllowance < committed)
          throw new OperatorConflictError("The adjustment would reduce the allowance below committed usage.");

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
          operationId: data.operationId,
          reason,
          metadata: {
            creditDelta: data.creditDelta,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
          },
        });
        return mapAdjustment(adjustment);
      },
      { companyId: data.companyId },
    );
  }

  @BypassTenantGuard
  async resetUserCreditsOrThrowUnscoped(
    data: ResetOperatorUserCreditsData,
    now = new Date(),
  ): Promise<ResetOperatorUserCreditsResultDto> {
    const companyId = await this.userCompanyIdOrThrow(data.userId);
    return runInTransaction(
      async () => {
        const actor = getOperatorActor();
        const reason = data.reason ?? null;
        const [existing, priorAudit] = await Promise.all([
          this.prisma.agentCreditAdjustment.findUnique({
            where: { operationId: data.operationId },
          }),
          this.prisma.operatorAuditEvent.findUnique({
            where: { operationId: data.operationId },
          }),
        ]);
        if (existing || priorAudit) {
          const metadata = priorAudit?.metadata as Record<string, unknown> | null | undefined;
          if (
            !existing ||
            !priorAudit ||
            existing.companyId !== companyId ||
            existing.userId !== data.userId ||
            existing.reason !== reason ||
            existing.createdByOperatorUserId !== actor.userId ||
            priorAudit.actorUserId !== actor.userId ||
            priorAudit.action !== OPERATOR_AUDIT_ACTION.creditBalanceReset ||
            priorAudit.targetCompanyId !== companyId ||
            priorAudit.targetUserId !== data.userId ||
            priorAudit.reason !== reason ||
            metadata?.mode !== data.mode ||
            metadata?.expectedPeriodStart !== data.expectedPeriodStart ||
            metadata?.expectedPeriodEnd !== data.expectedPeriodEnd ||
            metadata?.expectedBaseAllowanceCredits !== data.expectedBaseAllowanceCredits ||
            metadata?.expectedAdjustmentCredits !== data.expectedAdjustmentCredits ||
            metadata?.expectedCommittedCredits !== data.expectedCommittedCredits ||
            metadata?.creditDelta !== existing.creditDelta ||
            metadata?.periodStart !== existing.periodStart.toISOString() ||
            metadata?.periodEnd !== existing.periodEnd.toISOString()
          )
            throw new OperatorConflictError("The operation ID was already used for another request.");

          return {
            adjustment: mapAdjustment(existing),
            user: await this.userDetailOrThrow(data.userId, now),
          };
        }

        const user = await this.prisma.user.findFirst({
          where: { id: data.userId, companyId },
          select: operatorUserDetailSelect,
        });
        if (!user) throw new OperatorNotFoundError("User not found.");
        if (user.status !== Status.active) throw new OperatorConflictError("Credit resets require an active user.");
        if (!user.company.subscription)
          throw new OperatorConfigurationError("The selected company has no subscription.");

        const credit = await this.userCreditPeriod(user, now);
        if (!credit) throw new OperatorConfigurationError("The selected user has no credit period.");
        if (
          credit.periodStart !== data.expectedPeriodStart ||
          credit.periodEnd !== data.expectedPeriodEnd ||
          credit.baseAllowanceCredits !== data.expectedBaseAllowanceCredits ||
          credit.adjustmentCredits !== data.expectedAdjustmentCredits ||
          credit.committedCredits !== data.expectedCommittedCredits
        )
          throw new OperatorConflictError("The user's credit position changed. Refresh before resetting credits.");

        const currentAllowance = credit.baseAllowanceCredits + credit.adjustmentCredits;
        if (!Number.isSafeInteger(currentAllowance))
          throw new OperatorConfigurationError("Current hosted-AI allowance is invalid.");

        const creditDelta =
          data.mode === "baseAllowance" ? -credit.adjustmentCredits : credit.committedCredits - currentAllowance;
        if (!Number.isSafeInteger(creditDelta) || Math.abs(creditDelta) > MAX_ADJUSTMENT_CREDITS)
          throw new OperatorConflictError("The required reset adjustment exceeds the safe credit limit.");

        if (creditDelta === 0)
          throw new OperatorConflictError("The user's credits already match the requested reset target.");

        const resultingAllowance = currentAllowance + creditDelta;
        if (!Number.isSafeInteger(resultingAllowance) || resultingAllowance < credit.committedCredits)
          throw new OperatorConflictError("The reset would reduce the allowance below committed usage.");

        const adjustment = await this.prisma.agentCreditAdjustment.create({
          data: {
            companyId,
            userId: data.userId,
            creditDelta,
            periodStart: new Date(credit.periodStart),
            periodEnd: new Date(credit.periodEnd),
            reason,
            operationId: data.operationId,
            createdByOperatorUserId: actor.userId,
          },
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.creditBalanceReset,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          operationId: data.operationId,
          reason,
          metadata: {
            mode: data.mode,
            expectedPeriodStart: data.expectedPeriodStart,
            expectedPeriodEnd: data.expectedPeriodEnd,
            expectedBaseAllowanceCredits: data.expectedBaseAllowanceCredits,
            expectedAdjustmentCredits: data.expectedAdjustmentCredits,
            expectedCommittedCredits: data.expectedCommittedCredits,
            periodStart: credit.periodStart,
            periodEnd: credit.periodEnd,
            baseAllowanceCredits: credit.baseAllowanceCredits,
            previousAdjustmentCredits: credit.adjustmentCredits,
            committedCredits: credit.committedCredits,
            creditDelta,
            resultingAllowanceCredits: resultingAllowance,
          },
        });
        return {
          adjustment: mapAdjustment(adjustment),
          user: await this.userDetailOrThrow(data.userId, now),
        };
      },
      { companyId },
    );
  }

  @BypassTenantGuard
  async updateGlobalControlUnscoped(data: UpdateHostedAiGlobalControlData): Promise<HostedAiGlobalControlDto> {
    if (env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED !== true)
      throw new OperatorConfigurationError("Hosted-AI global control mutations are disabled by server configuration.");

    return runInTransaction(async () => {
      await this.prisma.$queryRaw`SELECT "id" FROM "HostedAiGlobalControl" WHERE "id" = 'global' FOR UPDATE`;
      const current = await this.getGlobalControlOrThrow();
      const actor = getOperatorActor();
      const prior = await this.prisma.operatorAuditEvent.findUnique({
        where: { operationId: data.operationId },
      });
      if (prior) {
        const metadata = prior.metadata as Record<string, unknown> | null;
        if (
          prior.actorUserId !== actor.userId ||
          prior.action !== OPERATOR_AUDIT_ACTION.globalControlUpdate ||
          prior.reason !== data.reason ||
          metadata?.expectedVersion !== data.expectedVersion ||
          metadata?.hostedProviderWorkPaused !== data.hostedProviderWorkPaused ||
          metadata?.monthlySpendCapMicrocents !== data.monthlySpendCapMicrocents
        )
          throw new OperatorConflictError("The operation ID was already used for another request.");

        return mapGlobalControl(current);
      }
      if (current.version !== data.expectedVersion)
        throw new OperatorConflictError("Hosted-AI global controls changed. Refresh before saving again.");

      const updated = await this.prisma.hostedAiGlobalControl.update({
        where: { id: "global" },
        data: {
          hostedProviderWorkPaused: data.hostedProviderWorkPaused,
          monthlySpendCapMicrocents:
            data.monthlySpendCapMicrocents === null ? null : BigInt(data.monthlySpendCapMicrocents),
          reason: data.reason,
          version: { increment: 1 },
          updatedByOperatorUserId: actor.userId,
        },
      });
      await this.createAudit({
        action: OPERATOR_AUDIT_ACTION.globalControlUpdate,
        operationId: data.operationId,
        reason: data.reason,
        metadata: {
          expectedVersion: data.expectedVersion,
          hostedProviderWorkPaused: data.hostedProviderWorkPaused,
          monthlySpendCapMicrocents: data.monthlySpendCapMicrocents,
        },
      });
      return mapGlobalControl(updated);
    });
  }

  @BypassTenantGuard
  async listAuditEventsAuditedUnscoped(args: { cursor?: string; limit: number }): Promise<OperatorAuditPageDto> {
    return runInTransaction(async () => {
      const rows = await this.prisma.operatorAuditEvent.findMany({
        ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
        take: args.limit + 1,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const hasMore = rows.length > args.limit;
      const visible = hasMore ? rows.slice(0, args.limit) : rows;

      return {
        events: visible.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? (visible.at(-1)?.id ?? null) : null,
      };
    });
  }
}
