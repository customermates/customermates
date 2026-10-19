import { presetId } from "@/features/records/crm-preset";
import type { OperatorWriteOwners } from "./operator-write-owners";
import type { Prisma } from "@/generated/prisma";
import { ConnectedAccountStatus, Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { getOperatorActor } from "@/core/decorators/operator-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import {
  agentCreditsToMicrocents,
  agentMicrocentsFromStorage,
  resolveAgentCreditEntitlement,
  memberCreditHeadroomMicrocents,
  workspaceIndexingShareMicrocents,
} from "@/ee/agent-chat/agent-credit-policy";
import { env } from "@/env";
import type { AgentUsageRepo } from "@/ee/agent-chat/agent-usage.repo";
import { isAwaitingFirstPlan } from "@/ee/subscription/entitlements";

import {
  holdsPlatformOperatorsOnlyMembership,
  isPlatformOperatorEmail,
  otherPlatformOperatorCanAct,
  strandsLastPlatformOperator,
} from "@/features/user/platform-operator-logins";

import { normalizeOperatorEmail } from "./operator-access.service";
import type { OperatorRefusal, OperatorRepo } from "./operator.repo";
import {
  OPERATOR_AUDIT_ACTION,
  type AgentCreditAdjustmentDto,
  type CorrectOperatorSubscriptionSnapshotData,
  type CreateAgentCreditAdjustmentData,
  type DeleteOperatorWorkspaceData,
  type DeleteOperatorWorkspaceResultDto,
  type GetOperatorWorkspaceStatsData,
  type HostedAiOperatorCompanyDto,
  type HostedAiOperatorOverviewDto,
  type HostedAiUsageTotalsDto,
  type OperatorUserCreditPeriodDto,
  type OperatorUserDetailDto,
  type OperatorUserSummaryDto,
  type OperatorWorkspaceStatsDto,
  type OperatorWorkspaceTagsDto,
  type ResetOperatorUserCreditsData,
  type ResetOperatorUserCreditsResultDto,
  type UpdateHostedAiEnterpriseAllowanceData,
  type UpdateOperatorSubscriptionTermsData,
  type UpdateOperatorUserPlatformAccessData,
  type UpdateOperatorUserStatusData,
  type UpdateOperatorWorkspaceTagsData,
} from "./operator.schema";
import { workspaceLabelFor } from "./workspace-label";

function normalizeWorkspaceTags(tags: string[]): string[] {
  const byComparisonKey = new Map<string, string>();

  for (const candidate of tags) {
    const tag = candidate.trim().replace(/\s+/g, " ");
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (!byComparisonKey.has(key)) byComparisonKey.set(key, tag);
  }

  return [...byComparisonKey.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, tag]) => tag);
}

type AuditAction = (typeof OPERATOR_AUDIT_ACTION)[keyof typeof OPERATOR_AUDIT_ACTION];
const MAX_ADJUSTMENT_MICROCENTS = agentCreditsToMicrocents(1_000_000);

const operatorUserDetailSelect = {
  id: true,
  companyId: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
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

function asSafeMicrocents(value: bigint | null | undefined, description: string): number {
  const microcents = agentMicrocentsFromStorage(value, description);
  if (microcents < 0) throw new Error(`${description} is invalid.`);
  return microcents;
}

function addSafeMicrocents(left: number, right: number, description: string): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`${description} is invalid.`);
  return total;
}

function adjustmentDto(row: {
  id: string;
  companyId: string;
  userId: string;
  deltaMicrocents: bigint;
  periodStart: Date;
  periodEnd: Date;
  reason: string | null;
  operationId: string;
  createdByOperatorUserId: string | null;
  createdAt: Date;
}): AgentCreditAdjustmentDto {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    deltaMicrocents: agentMicrocentsFromStorage(row.deltaMicrocents, "Hosted-AI credit adjustment"),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    reason: row.reason,
    operationId: row.operationId,
    createdByOperatorUserId: row.createdByOperatorUserId,
    createdAt: row.createdAt,
  };
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
  chargedMicrocents: bigint | null | undefined;
  reservedMicrocents: bigint | null | undefined;
}): HostedAiUsageTotalsDto {
  const settled = input.settledCostMicrocents ?? 0n;
  const reservedExposure = input.reservedMicrocents ?? 0n;
  const charged = input.chargedMicrocents ?? 0n;
  if (settled < 0n) throw new Error("Settled hosted-AI cost is invalid.");
  if (reservedExposure < 0n) throw new Error("Reserved hosted-AI credits are invalid.");
  if (charged < 0n) throw new Error("Charged hosted-AI credits are invalid.");

  return {
    settledCostMicrocents: settled.toString(),
    reservedExposureMicrocents: reservedExposure.toString(),
    totalCommittedMicrocents: (settled + reservedExposure).toString(),
    chargedMicrocents: charged.toString(),
  };
}

export class PrismaOperatorRepo extends TenantRepository implements OperatorRepo {
  constructor(
    private readonly agentRepo: AgentUsageRepo,
    private readonly owners: OperatorWriteOwners,
  ) {
    super();
  }

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

  private async seatLedger(seat: { companyId: string; userId: string; periodStart: Date; periodEnd: Date }) {
    const settledWhere = { ...seat, state: "settled" as const };
    const reservedWhere = {
      ...seat,
      state: { in: ["reserved" as const, "retained" as const] },
    };
    const [adjustments, settled, reserved] = await Promise.all([
      this.prisma.agentCreditAdjustment.aggregate({
        where: seat,
        _sum: { deltaMicrocents: true },
      }),
      this.prisma.agentUsageEvent.aggregate({
        where: settledWhere,
        _sum: { chargedMicrocents: true },
      }),
      this.prisma.agentUsageEvent.aggregate({
        where: reservedWhere,
        _sum: { reservedMicrocents: true },
      }),
    ]);
    return {
      adjustmentMicrocents: agentMicrocentsFromStorage(
        adjustments._sum.deltaMicrocents,
        "Hosted-AI credit adjustment total",
      ),
      chargedMicrocents: asSafeMicrocents(settled._sum.chargedMicrocents, "Charged hosted-AI credits"),
      reservedMicrocents: asSafeMicrocents(reserved._sum.reservedMicrocents, "Reserved hosted-AI credits"),
    };
  }

  private async usageTotals(companyId: string | null, now: Date): Promise<HostedAiUsageTotalsDto> {
    const month = utcMonth(now);
    const companyWhere = companyId ? { companyId } : {};
    const settledWhere = {
      ...companyWhere,
      state: "settled" as const,
      settledAt: { gte: month.start, lt: month.end },
    };
    const reservedWhere = {
      ...companyWhere,
      state: { in: ["reserved" as const, "retained" as const] },
    };
    const [settled, reserved] = await Promise.all([
      this.prisma.agentUsageEvent.aggregate({
        where: settledWhere,
        _sum: { costMicrocents: true, chargedMicrocents: true },
      }),
      this.prisma.agentUsageEvent.aggregate({
        where: reservedWhere,
        _sum: { reservedMicrocents: true },
      }),
    ]);

    const [platform, platformReserved] = companyId
      ? [null, null]
      : await Promise.all([
          this.prisma.hostedAiPlatformUsage.aggregate({
            where: { accrualMonth: month.start },
            _sum: { costMicrocents: true },
          }),
          this.prisma.hostedAiPlatformReservation.aggregate({
            _sum: { reservedMicrocents: true },
          }),
        ]);

    return toUsageTotals({
      settledCostMicrocents: (settled._sum.costMicrocents ?? 0n) + (platform?._sum.costMicrocents ?? 0n),
      chargedMicrocents: settled._sum.chargedMicrocents,
      reservedMicrocents: (reserved._sum.reservedMicrocents ?? 0n) + (platformReserved?._sum.reservedMicrocents ?? 0n),
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

  private async authIdentityByUserId(
    users: Array<{ id: string; companyId: string; email: string }>,
  ): Promise<Map<string, { emailVerified: boolean; isPlatformOperator: boolean }>> {
    if (users.length === 0) return new Map();

    const authUsers = await this.prisma.authUser.findMany({
      where: {
        email: { in: users.map((user) => user.email), mode: "insensitive" },
      },
      select: { email: true, emailVerified: true, isPlatformOperator: true, companyId: true },
    });
    const byEmail = new Map<string, typeof authUsers>();
    for (const authUser of authUsers) {
      const email = normalizeOperatorEmail(authUser.email);
      byEmail.set(email, [...(byEmail.get(email) ?? []), authUser]);
    }

    return new Map(
      users.map((user) => {
        const matches = byEmail.get(normalizeOperatorEmail(user.email)) ?? [];
        const single = matches.length === 1 ? matches[0] : null;
        return [
          user.id,
          { emailVerified: single?.emailVerified ?? false, isPlatformOperator: single?.isPlatformOperator ?? false },
        ];
      }),
    );
  }

  private mapUserBase(
    user: OperatorUserRecord,
    identity: { emailVerified: boolean; isPlatformOperator: boolean } | undefined,
  ) {
    const subscription = user.company.subscription;
    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      status: user.status,
      isPlatformOperator: identity?.isPlatformOperator ?? false,
      authEmailVerified: identity?.emailVerified ?? false,
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
    const { adjustmentMicrocents, chargedMicrocents, reservedMicrocents } = await this.seatLedger({
      companyId: user.companyId,
      userId: user.id,
      periodStart: entitlement.start,
      periodEnd: entitlement.resetAt,
    });
    const rawEffectiveAllowance = entitlement.limitMicrocents + adjustmentMicrocents;
    if (!Number.isSafeInteger(rawEffectiveAllowance)) throw new Error("Effective hosted-AI allowance is invalid.");

    const effectiveAllowanceMicrocents = user.status === Status.active ? Math.max(0, rawEffectiveAllowance) : 0;
    const pool = await this.agentRepo.getWorkspaceCreditPoolUnscoped(user.companyId, now);
    const samePeriod =
      pool !== null &&
      pool.periodStart.getTime() === entitlement.start.getTime() &&
      pool.periodEnd.getTime() === entitlement.resetAt.getTime();
    const sharedIndexingMicrocents = samePeriod
      ? workspaceIndexingShareMicrocents({
          unassignedMicrocents: pool.unassignedMicrocents,
          memberLimitMicrocents: effectiveAllowanceMicrocents,
          poolLimitMicrocents: pool.limitMicrocents,
        })
      : 0;
    const committedMicrocents = addSafeMicrocents(
      addSafeMicrocents(chargedMicrocents, reservedMicrocents, "Committed hosted-AI credits"),
      sharedIndexingMicrocents,
      "Committed hosted-AI credits",
    );
    const remainingMicrocents = memberCreditHeadroomMicrocents({
      memberLimitMicrocents: effectiveAllowanceMicrocents,
      memberUsedMicrocents: committedMicrocents,
      poolLimitMicrocents: samePeriod ? pool.limitMicrocents : effectiveAllowanceMicrocents,
      poolUsedMicrocents: samePeriod ? pool.usedMicrocents : committedMicrocents,
    });

    return {
      periodStart: entitlement.start,
      periodEnd: entitlement.resetAt,
      baseAllowanceMicrocents: entitlement.limitMicrocents,
      adjustmentMicrocents,
      effectiveAllowanceMicrocents,
      chargedMicrocents,
      reservedMicrocents,
      committedMicrocents,
      remainingMicrocents,
      overageMicrocents: Math.max(0, committedMicrocents - effectiveAllowanceMicrocents),
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

    const [identities, creditPeriod] = await Promise.all([
      this.authIdentityByUserId([user]),
      this.userCreditPeriod(user, now),
    ]);
    const subscription = user.company.subscription;
    const statusRequiresProviderSeatSync = Boolean(subscription?.lemonSqueezyId);
    return {
      ...this.mapUserBase(user, identities.get(user.id)),
      updatedAt: user.updatedAt,
      agentCreditActivatedAt: user.agentCreditActivatedAt,
      isCurrentOperator: getOperatorActor().email === normalizeOperatorEmail(user.email),
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
    const [loginRows, verifiedRows, subscriptions, companiesWithoutSubscription, totalCompanies] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          totalUsers: bigint;
          active: bigint;
          inactive: bigint;
          pendingAuthorization: bigint;
          platformOperators: bigint;
        }>
      >`
        SELECT
          COUNT(DISTINCT lower(member."email"))::bigint AS "totalUsers",
          COUNT(DISTINCT lower(member."email")) FILTER (WHERE member."status"::text = 'active')::bigint AS "active",
          COUNT(DISTINCT lower(member."email")) FILTER (WHERE member."status"::text = 'inactive')::bigint AS "inactive",
          COUNT(DISTINCT lower(member."email"))
            FILTER (WHERE member."status"::text = 'pendingAuthorization')::bigint AS "pendingAuthorization",
          (SELECT COUNT(*) FROM "AuthUser" AS login WHERE login."isPlatformOperator" AND login."emailVerified")::bigint AS "platformOperators"
        FROM "User" AS member
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM "AuthUser" AS login
        WHERE login."emailVerified" = true
          AND EXISTS (
            SELECT 1
            FROM "User" AS member
            WHERE lower(member."email") = lower(login."email")
          )
          AND (
            SELECT COUNT(*)
            FROM "AuthUser" AS candidate
            WHERE lower(candidate."email") = lower(login."email")
          ) = 1
      `,
      this.prisma.subscription.findMany({
        select: { companyId: true, plan: true, status: true },
      }),
      this.prisma.company.findMany({
        where: { subscription: { is: null } },
        select: { id: true },
      }),
      this.prisma.company.count(),
    ]);
    const buckets = [
      ...subscriptions.flatMap(({ companyId, plan, status }) => [
        { companyId, key: `plan:${plan}` },
        { companyId, key: `status:${status}` },
      ]),
      ...companiesWithoutSubscription.map((company) => ({
        companyId: company.id,
        key: "missing",
      })),
    ];
    const bucketRows =
      buckets.length === 0
        ? []
        : await this.prisma.$queryRaw<Array<{ key: string; count: bigint }>>`
            SELECT bucket."key", COUNT(DISTINCT lower(member."email"))::bigint AS "count"
            FROM unnest(
              ${buckets.map((bucket) => bucket.companyId)}::text[],
              ${buckets.map((bucket) => bucket.key)}::text[]
            ) AS bucket("companyId", "key")
            JOIN "User" AS member ON member."companyId" = bucket."companyId"
            GROUP BY bucket."key"
          `;
    const loginsByBucket = new Map(
      bucketRows.map((row) => [row.key, asSafeBigIntCount(row.count, `Login count for ${row.key}`)]),
    );
    const logins = loginRows[0];
    const summary = emptyUserSummary();
    summary.totalUsers = asSafeBigIntCount(logins?.totalUsers, "Login count");
    summary.byStatus.active = asSafeBigIntCount(logins?.active, "Active login count");
    summary.byStatus.inactive = asSafeBigIntCount(logins?.inactive, "Inactive login count");
    summary.byStatus.pendingAuthorization = asSafeBigIntCount(logins?.pendingAuthorization, "Pending login count");
    summary.totalCompanies = totalCompanies;
    summary.platformOperators = asSafeBigIntCount(logins?.platformOperators, "Platform operator count");
    summary.verifiedAuthUsers = asSafeBigIntCount(verifiedRows[0]?.count, "Verified auth-user count");
    for (const plan of Object.values(SubscriptionPlan)) summary.byPlan[plan] = loginsByBucket.get(`plan:${plan}`) ?? 0;
    for (const status of Object.values(SubscriptionStatus))
      summary.bySubscriptionStatus[status] = loginsByBucket.get(`status:${status}`) ?? 0;

    summary.byPlan.missing = loginsByBucket.get("missing") ?? 0;
    summary.bySubscriptionStatus.missing = loginsByBucket.get("missing") ?? 0;

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
            leftAt: true,
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
        if (target.leftAt && data.status !== Status.inactive) return "conflict";

        const statusChanged = target.status !== data.status;
        const subscription = target.company.subscription;
        if (statusChanged && subscription?.lemonSqueezyId) return "conflict";

        const leavingActive = target.status === Status.active && data.status !== Status.active;
        if (leavingActive && (await strandsLastPlatformOperator(this.prisma, { id: data.userId }))) return "conflict";
        if (leavingActive && target.role?.isSystemRole) {
          const otherActiveSystemUsers = await this.prisma.user.count({
            where: {
              companyId,
              id: { not: data.userId },
              status: Status.active,
              leftAt: null,
              role: { isSystemRole: true },
            },
          });
          if (otherActiveSystemUsers === 0) return "conflict";
        }

        const leavingPending =
          target.status === Status.pendingAuthorization && data.status !== Status.pendingAuthorization;
        const protectedTasks = leavingPending
          ? await this.prisma.crmRecord.findMany({
              where: {
                companyId,
                protectedKind: "membershipAuthorization",
                systemData: { path: ["relatedUserId"], equals: data.userId },
              },
              select: { id: true, typeId: true },
            })
          : [];
        if (protectedTasks.length) {
          const [state, linked] = await Promise.all([
            this.prisma.recordSchemaState.findUnique({
              where: { companyId },
              select: { activeOperationId: true },
            }),
            this.prisma.recordLink.findFirst({
              where: {
                companyId,
                deletedAt: null,
                OR: protectedTasks.flatMap((task) => [
                  { sourceTypeId: task.typeId, sourceId: task.id },
                  { targetTypeId: task.typeId, targetId: task.id },
                ]),
              },
              select: { id: true },
            }),
          ]);
          if (state?.activeOperationId || linked) return "conflict";
        }

        const enteringActive = target.status !== Status.active && data.status === Status.active;
        await this.owners.users.setOperatorStatusCompanyWide(
          companyId,
          data.userId,
          data.status,
          enteringActive ? now : leavingActive ? null : undefined,
        );
        if (leavingPending && protectedTasks.length)
          await this.owners.records.deleteMembershipAuthorizationTasksCompanyWide(companyId, data.userId);

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
          select: {
            id: true,
            email: true,
            status: true,
            updatedAt: true,
          },
        });
        if (!target) return "notFound";

        const email = normalizeOperatorEmail(target.email);
        if (actor.email === email) return "conflict";
        const previousIsPlatformOperator = await isPlatformOperatorEmail(this.prisma, email);

        if (data.isPlatformOperator) {
          if (target.status !== Status.active) return "conflict";

          const resolvedMember = await this.prisma.user.findFirst({
            where: { email, id: data.userId, leftAt: null },
            select: { id: true },
          });
          if (resolvedMember?.id !== data.userId) return "conflict";

          const identity = await this.prisma.authUser.findUnique({
            where: { email },
            select: { emailVerified: true },
          });
          if (!identity?.emailVerified) return "conflict";
        } else if (previousIsPlatformOperator && !(await otherPlatformOperatorCanAct(this.prisma, email)))
          return "conflict";

        await this.owners.users.setPlatformOperatorUnscoped(email, data.isPlatformOperator);
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate,
          targetCompanyId: companyId,
          targetUserId: data.userId,
          reason,
          metadata: {
            previousIsPlatformOperator,
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

        await this.owners.companies.correctSubscriptionSnapshotUnscoped(companyId, next);
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

        await this.owners.companies.setEnterpriseAgentCreditsUnscoped(data.companyId, data.creditsPerUser);
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
        const deltaMicrocents = agentCreditsToMicrocents(data.creditDelta);
        const existing = await this.prisma.agentCreditAdjustment.findUnique({
          where: { operationId: data.operationId },
        });
        if (existing) {
          if (
            existing.companyId !== data.companyId ||
            existing.userId !== data.userId ||
            existing.deltaMicrocents !== BigInt(deltaMicrocents) ||
            existing.periodStart.getTime() !== periodStart.getTime() ||
            existing.periodEnd.getTime() !== periodEnd.getTime() ||
            existing.reason !== reason ||
            existing.createdByOperatorUserId !== actor.userId
          )
            return "conflict";

          return adjustmentDto(existing);
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

        const ledger = await this.seatLedger({
          companyId: data.companyId,
          userId: data.userId,
          periodStart,
          periodEnd,
        });
        const priorAdjustments = ledger.adjustmentMicrocents;
        const committed = addSafeMicrocents(
          ledger.chargedMicrocents,
          ledger.reservedMicrocents,
          "Committed hosted-AI credits",
        );
        const effectiveAllowance = entitlement.limitMicrocents + priorAdjustments + deltaMicrocents;
        if (!Number.isSafeInteger(effectiveAllowance) || effectiveAllowance < committed) return "conflict";

        const adjustment = await this.prisma.agentCreditAdjustment.create({
          data: {
            companyId: data.companyId,
            userId: data.userId,
            deltaMicrocents,
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
            deltaMicrocents,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
          },
        });
        return adjustmentDto(adjustment);
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
          if (
            existing.companyId !== companyId ||
            existing.userId !== data.userId ||
            existing.reason !== reason ||
            existing.createdByOperatorUserId !== actor.userId
          )
            return "conflict";

          return {
            adjustment: adjustmentDto(existing),
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
        const currentAllowance = credit.baseAllowanceMicrocents + credit.adjustmentMicrocents;
        if (!Number.isSafeInteger(currentAllowance)) throw new Error("Current hosted-AI allowance is invalid.");

        const ledger = await this.seatLedger({
          companyId,
          userId: user.id,
          periodStart: credit.periodStart,
          periodEnd: credit.periodEnd,
        });
        const directCommittedMicrocents = addSafeMicrocents(
          ledger.chargedMicrocents,
          ledger.reservedMicrocents,
          "Committed hosted-AI credits",
        );
        const deltaMicrocents =
          data.mode === "baseAllowance" ? -credit.adjustmentMicrocents : directCommittedMicrocents - currentAllowance;
        if (!Number.isSafeInteger(deltaMicrocents) || Math.abs(deltaMicrocents) > MAX_ADJUSTMENT_MICROCENTS)
          return "conflict";

        if (deltaMicrocents === 0) return "conflict";

        const resultingAllowance = currentAllowance + deltaMicrocents;
        if (!Number.isSafeInteger(resultingAllowance) || resultingAllowance < directCommittedMicrocents)
          return "conflict";

        const adjustment = await this.prisma.agentCreditAdjustment.create({
          data: {
            companyId,
            userId: data.userId,
            deltaMicrocents,
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
            baseAllowanceMicrocents: credit.baseAllowanceMicrocents,
            previousAdjustmentMicrocents: credit.adjustmentMicrocents,
            committedMicrocents: credit.committedMicrocents,
            deltaMicrocents,
            resultingAllowanceMicrocents: resultingAllowance,
          },
        });
        return {
          adjustment: adjustmentDto(adjustment),
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
            name: true,
            users: {
              select: {
                id: true,
                email: true,
                status: true,
              },
            },
            subscription: {
              select: { plan: true, status: true, lemonSqueezyId: true },
            },
          },
        });
        if (!company) return "notFound";

        const workspaceLabel = workspaceLabelFor(company, company.users);
        if (data.confirmWorkspaceLabel !== workspaceLabel) return "conflict";
        if (await holdsPlatformOperatorsOnlyMembership(this.prisma, data.companyId)) return "conflict";

        const liveConnectedAccounts = await this.prisma.connectedAccount.count({
          where: {
            companyId: data.companyId,
            status: { not: ConnectedAccountStatus.deleted },
          },
        });
        if (liveConnectedAccounts > 0) return "connectedAccountsActive";

        const memberIds = company.users.map((member) => member.id);
        const memberEmails = company.users.map((member) => member.email);

        await this.owners.companies.deleteInviteTokensByCreatorsUnscoped(memberIds);

        const membershipsElsewhere = await this.prisma.user.findMany({
          where: {
            email: { in: memberEmails, mode: "insensitive" },
            companyId: { not: data.companyId },
          },
          select: { email: true },
        });
        const sharedEmails = new Set(membershipsElsewhere.map((member) => member.email.toLowerCase()));
        const soleEmails = memberEmails.filter((email) => !sharedEmails.has(email.toLowerCase()));
        const identities = await this.prisma.authUser.findMany({
          where: { email: { in: soleEmails, mode: "insensitive" } },
          select: { id: true },
        });
        const identityIds = identities.map((identity) => identity.id);
        await this.owners.identities.deleteApiKeysForIdentities(identityIds);
        await this.owners.identities.deleteVerificationsForEmails(soleEmails);
        await this.owners.users.deleteAuthIdentitiesUnscoped(identityIds);
        await this.owners.inboundEvents.deleteCompanyInboundEventsUnscoped(data.companyId);

        const deletedWorkflowRunCount = await this.owners.companies.deleteWorkflowRunsUnscoped(data.companyId);
        await this.owners.companies.deleteCompanyUnscoped(data.companyId);
        const clearedAuthIdentityCompanies = await this.owners.users.detachAuthIdentitiesFromCompanyUnscoped(
          data.companyId,
        );

        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.workspaceDelete,
          targetCompanyId: data.companyId,
          reason: data.reason,
          metadata: {
            workspaceLabel,
            deletedMemberCount: memberIds.length,
            deletedAuthIdentityCount: identityIds.length,
            clearedAuthIdentityCompanyCount: clearedAuthIdentityCompanies,
            deletedWorkflowRunCount,
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
      { ...BULK_WRITE_TRANSACTION, companyId: data.companyId },
    );
  }

  @BypassTenantGuard
  async updateSubscriptionTermsUnscoped(
    data: UpdateOperatorSubscriptionTermsData,
    now = new Date(),
  ): Promise<HostedAiOperatorCompanyDto | OperatorRefusal> {
    return runInTransaction(
      async () => {
        const reason = data.reason ?? null;
        const subscription = await this.prisma.subscription.findUnique({
          where: { companyId: data.companyId },
        });
        if (!subscription) return "notFound";

        const trialEndDate = data.trialEndDate === null ? null : new Date(data.trialEndDate);
        if (trialEndDate && !Number.isFinite(trialEndDate.getTime())) return "conflict";
        if (trialEndDate === null && subscription.trialEndDate !== null) return "trialEndRequired";

        const status =
          trialEndDate !== null && isAwaitingFirstPlan(subscription) ? SubscriptionStatus.trial : subscription.status;
        const previous = {
          trialEndDate: subscription.trialEndDate?.toISOString() ?? null,
          lemonSqueezyId: subscription.lemonSqueezyId,
          status: subscription.status,
        };
        const next = {
          trialEndDate: trialEndDate?.toISOString() ?? null,
          lemonSqueezyId: data.lemonSqueezyId,
          status,
        };

        await this.owners.companies.setSubscriptionTermsUnscoped(data.companyId, {
          trialEndDate,
          lemonSqueezyId: data.lemonSqueezyId,
          ...(status !== subscription.status ? { status } : {}),
        });
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.subscriptionTermsUpdate,
          targetCompanyId: data.companyId,
          reason,
          metadata: {
            previous,
            next,
            billingBindingCleared: previous.lemonSqueezyId !== null && next.lemonSqueezyId === null,
          },
        });

        const result = await this.companySnapshot(data.companyId, now);
        if (!result) throw new Error("Updated subscription terms could not be read.");
        return result;
      },
      { companyId: data.companyId },
    );
  }

  @BypassTenantGuard
  async getWorkspaceStatsUnscoped(
    data: GetOperatorWorkspaceStatsData,
  ): Promise<OperatorWorkspaceStatsDto | OperatorRefusal> {
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
      select: { id: true },
    });
    if (!company) return "notFound";

    const rows = await this.prisma.$queryRaw<
      Array<{
        contacts: number;
        organizations: number;
        deals: number;
        services: number;
        tasks: number;
        messagingThreads: number;
        messagingMessages: number;
        agentConversations: number;
        connectedAccounts: number;
        lastActiveAt: Date | null;
        lastActivityAt: Date | null;
      }>
    >`
      SELECT
        (SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = ${data.companyId} AND "deletedAt" IS NULL AND "typeId" = ${presetId(data.companyId, "contact")})::int AS "contacts",
        (SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = ${data.companyId} AND "deletedAt" IS NULL AND "typeId" = ${presetId(data.companyId, "organization")})::int AS "organizations",
        (SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = ${data.companyId} AND "deletedAt" IS NULL AND "typeId" = ${presetId(data.companyId, "deal")})::int AS "deals",
        (SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = ${data.companyId} AND "deletedAt" IS NULL AND "typeId" = ${presetId(data.companyId, "service")})::int AS "services",
        (SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = ${data.companyId} AND "deletedAt" IS NULL AND "typeId" = ${presetId(data.companyId, "task")})::int AS "tasks",
        (SELECT COUNT(*) FROM "MessagingThread" WHERE "companyId" = ${data.companyId})::int AS "messagingThreads",
        (SELECT COUNT(*) FROM "MessagingMessage" WHERE "companyId" = ${data.companyId})::int AS "messagingMessages",
        (SELECT COUNT(*) FROM "AgentConversation" WHERE "companyId" = ${data.companyId})::int AS "agentConversations",
        (SELECT COUNT(*) FROM "ConnectedAccount" WHERE "companyId" = ${data.companyId})::int AS "connectedAccounts",
        (SELECT MAX("lastActiveAt") FROM "User" WHERE "companyId" = ${data.companyId}) AS "lastActiveAt",
        (SELECT MAX("createdAt") FROM "EventLog" WHERE "companyId" = ${data.companyId}) AS "lastActivityAt"
    `;

    const row = rows[0];
    if (!row) throw new Error("Workspace statistics could not be read.");

    return { companyId: data.companyId, ...row };
  }

  @BypassTenantGuard
  async updateWorkspaceTagsUnscoped(
    data: UpdateOperatorWorkspaceTagsData,
  ): Promise<OperatorWorkspaceTagsDto | OperatorRefusal> {
    return runInTransaction(
      async () => {
        const company = await this.prisma.company.findUnique({
          where: { id: data.companyId },
          select: { tags: true },
        });
        if (!company) return "notFound";

        const previous = normalizeWorkspaceTags(company.tags);
        const next = normalizeWorkspaceTags(data.tags);

        await this.owners.companies.setWorkspaceTagsUnscoped(data.companyId, next);
        await this.createAudit({
          action: OPERATOR_AUDIT_ACTION.workspaceTagsUpdate,
          targetCompanyId: data.companyId,
          reason: data.reason ?? null,
          metadata: {
            previous,
            next,
            added: next.filter((tag) => !previous.includes(tag)),
            removed: previous.filter((tag) => !next.includes(tag)),
          },
        });

        return { companyId: data.companyId, tags: next };
      },
      { companyId: data.companyId },
    );
  }

  @BypassTenantGuard
  async listWorkspaceTagsUnscoped(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ tag: string }>>`
      SELECT tag
      FROM (SELECT DISTINCT unnest("tags") AS tag FROM "Company") AS distinct_tags
      ORDER BY lower(tag) ASC, tag ASC
    `;

    return rows.map((row) => row.tag);
  }
}
