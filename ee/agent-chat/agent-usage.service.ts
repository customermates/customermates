import type { AgentUsageRepo } from "./agent-usage.repo";
import { z } from "zod";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { env } from "@/env";
import type { Data } from "@/core/validation/validation.utils";

import {
  AGENT_RETRIEVAL_RESERVATION_TTL_MS,
  agentMicrocentsToCredits,
  memberCreditHeadroomMicrocents,
  resolveAgentCreditEntitlement,
  workspaceIndexingShareMicrocents,
} from "./agent-credit-policy";
import { agentRoundWorstCaseMicrocents, resolveAgentTurnBudget, type AgentTurnBudget } from "./agent-budget-policy";
import type { AgentModelEntry } from "./model-catalog";

export type AgentRetrievalPayer = "grant" | "platform";

export type AgentWorkspaceCreditPool = {
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date;
  limitMicrocents: number;
  usedMicrocents: number;
  unassignedMicrocents: number;
  memberLimitMicrocents: Record<string, number>;
  usable: boolean;
};

export type AgentRetrievalReservation = {
  id: string;
  grant: AgentRetrievalGrant;
  reservedMicrocents: number;
  reservedAt: Date;
};

export type AgentRetrievalGrant = {
  purpose: "wikiRetrieval" | "wikiIndexing" | "wikiSynthesis";
  companyId: string;
  userId: string | null;
  planSnapshot: SubscriptionPlan;
  subscriptionStatusSnapshot: SubscriptionStatus;
  allowanceMicrocentsSnapshot: number;
  periodStart: Date;
  periodEnd: Date;
};

export type AgentRetrievalCharge = {
  model: string;
  inputTokens: number;
  costMicrocents: number;
  costSource: "measured" | "estimated";
};

export const AgentUsageBlockedReasonSchema = z.enum([
  "self_hosted",
  "subscription_unavailable",
  "credits_exhausted",
  "configuration_unavailable",
]);

export const AgentUsageSummarySchema = z.object({
  creditsUsed: z.number(),
  creditsRemaining: z.number(),
  creditsLimit: z.number(),
  usedPct: z.number(),
  plan: z.enum(SubscriptionPlan).nullable(),
  periodStart: z.date(),
  resetAt: z.date(),
  recentTurnCredits: z.number().nullable(),
  blockedReason: AgentUsageBlockedReasonSchema.nullable(),
});

export type AgentUsageSummary = Data<typeof AgentUsageSummarySchema>;

export type AgentTurnCreditReservation = {
  reservedMicrocents: number;
  planSnapshot: SubscriptionPlan;
  subscriptionStatusSnapshot: SubscriptionStatus;
  allowanceMicrocentsSnapshot: number;
  periodStart: Date;
  periodEnd: Date;
  budget: AgentTurnBudget;
};

type ResolvedUsageState = {
  user: NonNullable<Awaited<ReturnType<AgentUsageRepo["findUserForUsageUnscoped"]>>>;
  summary: AgentUsageSummary;
  remainingMicrocents: number;
  limitMicrocents: number;
};

function usagePct(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function assertMicrocentCount(value: number, description: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${description} is invalid.`);
}

export class AgentUsageService {
  constructor(private repo: AgentUsageRepo) {}

  private async resolveUsageState(userId: string, now: Date): Promise<ResolvedUsageState> {
    const user = await this.repo.findUserForUsageUnscoped(userId);
    if (!user) throw new Error("User not found for agent usage.");

    const subscription = user.subscription;
    if (!subscription) {
      const period = resolveAgentCreditEntitlement({
        appMode: env.APP_MODE,
        plan: SubscriptionPlan.starter,
        status: SubscriptionStatus.cancelled,
        trialEndDate: null,
        creditAnchorAt: user.createdAt,
        enterpriseCreditsPerUser: null,
        activeSeatAt: user.agentCreditActivatedAt,
        now,
      });
      return {
        user,
        remainingMicrocents: 0,
        limitMicrocents: 0,
        summary: {
          creditsUsed: 0,
          creditsRemaining: 0,
          creditsLimit: 0,
          usedPct: 0,
          plan: null,
          periodStart: period.start,
          resetAt: period.resetAt,
          recentTurnCredits: null,
          blockedReason: "subscription_unavailable",
        },
      };
    }
    const entitlementInput = {
      appMode: env.APP_MODE,
      plan: subscription.plan,
      status: subscription.status,
      trialEndDate: subscription.trialEndDate,
      creditAnchorAt: subscription.agentCreditAnchorAt ?? subscription.createdAt,
      enterpriseCreditsPerUser: subscription.enterpriseAgentCreditsPerUser,
      activeSeatAt: user.agentCreditActivatedAt,
      now,
    } as const;
    const baseEntitlement = resolveAgentCreditEntitlement(entitlementInput);
    const [usage, adjustmentMicrocents, pool] = await Promise.all([
      this.repo.getUserCreditUsageUnscoped(user.companyId, userId, baseEntitlement.start, baseEntitlement.resetAt),
      this.repo.getUserCreditAdjustmentUnscoped(user.companyId, userId, baseEntitlement.start, baseEntitlement.resetAt),
      this.repo.getWorkspaceCreditPoolUnscoped(user.companyId, now),
    ]);
    const entitlement = resolveAgentCreditEntitlement({
      ...entitlementInput,
      adjustmentMicrocents,
    });
    assertMicrocentCount(usage.usedMicrocents, "Stored AI credit usage");
    if (usage.recentTurnMicrocents !== null) assertMicrocentCount(usage.recentTurnMicrocents, "Recent AI turn usage");

    const activeSeat = user.status === Status.active;
    const limitMicrocents = activeSeat ? entitlement.limitMicrocents : 0;
    const samePeriod =
      pool !== null &&
      pool.periodStart.getTime() === entitlement.start.getTime() &&
      pool.periodEnd.getTime() === entitlement.resetAt.getTime();
    const indexingShareMicrocents = samePeriod
      ? workspaceIndexingShareMicrocents({
          unassignedMicrocents: pool.unassignedMicrocents,
          memberLimitMicrocents: limitMicrocents,
          poolLimitMicrocents: pool.limitMicrocents,
        })
      : 0;
    const usedMicrocents = usage.usedMicrocents + indexingShareMicrocents;
    const remainingMicrocents = memberCreditHeadroomMicrocents({
      memberLimitMicrocents: limitMicrocents,
      memberUsedMicrocents: usedMicrocents,
      poolLimitMicrocents: samePeriod ? pool.limitMicrocents : limitMicrocents,
      poolUsedMicrocents: samePeriod ? pool.usedMicrocents : usedMicrocents,
    });
    const publicEntitlementBlock =
      entitlement.blockedReason === "enterprise_allowance_missing"
        ? ("configuration_unavailable" as const)
        : entitlement.blockedReason;
    const blockedReason = activeSeat
      ? (publicEntitlementBlock ?? (remainingMicrocents === 0 ? ("credits_exhausted" as const) : null))
      : ("subscription_unavailable" as const);

    return {
      user,
      remainingMicrocents,
      limitMicrocents,
      summary: {
        creditsUsed: agentMicrocentsToCredits(usedMicrocents),
        creditsRemaining: agentMicrocentsToCredits(remainingMicrocents),
        creditsLimit: agentMicrocentsToCredits(limitMicrocents),
        usedPct: usagePct(usedMicrocents, limitMicrocents),
        plan: entitlement.plan,
        periodStart: entitlement.start,
        resetAt: entitlement.resetAt,
        recentTurnCredits:
          usage.recentTurnMicrocents === null ? null : agentMicrocentsToCredits(usage.recentTurnMicrocents),
        blockedReason,
      },
    };
  }

  async getUsageSummary(userId: string, now = new Date()): Promise<AgentUsageSummary> {
    return (await this.resolveUsageState(userId, now)).summary;
  }

  async prepareTurn(
    userId: string,
    now: Date,
    options: {
      model: AgentModelEntry;
      requiredContextBytes?: number;
      creditCeilingMicrocents?: number | null;
      webSearchReserveMicrocents?: number;
    },
  ): Promise<{
    summary: AgentUsageSummary;
    reservation: AgentTurnCreditReservation | null;
  }> {
    const state = await this.resolveUsageState(userId, now);
    if (state.summary.blockedReason) return { summary: state.summary, reservation: null };
    if (!state.user.subscription || !state.summary.plan) {
      return {
        summary: {
          ...state.summary,
          blockedReason: "configuration_unavailable",
        },
        reservation: null,
      };
    }

    const availableMicrocents = options.creditCeilingMicrocents
      ? Math.min(state.remainingMicrocents, options.creditCeilingMicrocents)
      : state.remainingMicrocents;
    const budget = resolveAgentTurnBudget({
      model: options.model,
      availableMicrocents,
      requiredContextBytes: options.requiredContextBytes,
      webSearchReserveMicrocents: options.webSearchReserveMicrocents,
    });
    if (!budget) {
      return {
        summary: {
          ...state.summary,
          blockedReason:
            availableMicrocents < agentRoundWorstCaseMicrocents(options.model)
              ? "credits_exhausted"
              : "configuration_unavailable",
        },
        reservation: null,
      };
    }

    return {
      summary: state.summary,
      reservation: {
        reservedMicrocents: budget.reservedMicrocents,
        planSnapshot: state.summary.plan,
        subscriptionStatusSnapshot: state.user.subscription.status,
        allowanceMicrocentsSnapshot: state.limitMicrocents,
        periodStart: state.summary.periodStart,
        periodEnd: state.summary.resetAt,
        budget,
      },
    };
  }

  async prepareRetrieval(
    userId: string,
    now = new Date(),
    purpose: "wikiRetrieval" | "wikiSynthesis" = "wikiRetrieval",
  ): Promise<AgentRetrievalGrant | null> {
    const state = await this.resolveUsageState(userId, now);
    if (state.summary.blockedReason || !state.user.subscription || !state.summary.plan) return null;
    if (!(await this.repo.admitsHostedAiRetrievalUnscoped(now))) return null;
    return {
      purpose,
      companyId: state.user.companyId,
      userId: state.user.id,
      planSnapshot: state.summary.plan,
      subscriptionStatusSnapshot: state.user.subscription.status,
      allowanceMicrocentsSnapshot: state.limitMicrocents,
      periodStart: state.summary.periodStart,
      periodEnd: state.summary.resetAt,
    };
  }

  async prepareWorkspaceIndexing(companyId: string, now = new Date()): Promise<AgentRetrievalGrant | null> {
    if (env.APP_MODE === "self-hosted") return null;
    const pool = await this.repo.getWorkspaceCreditPoolUnscoped(companyId, now);
    if (!pool?.usable) return null;
    assertMicrocentCount(pool.limitMicrocents, "Workspace AI credit allowance");
    assertMicrocentCount(pool.usedMicrocents, "Workspace AI credit usage");
    if (pool.usedMicrocents >= pool.limitMicrocents) return null;
    if (!(await this.repo.admitsHostedAiRetrievalUnscoped(now))) return null;
    return {
      purpose: "wikiIndexing",
      companyId,
      userId: null,
      planSnapshot: pool.plan,
      subscriptionStatusSnapshot: pool.subscriptionStatus,
      allowanceMicrocentsSnapshot: pool.limitMicrocents,
      periodStart: pool.periodStart,
      periodEnd: pool.periodEnd,
    };
  }

  async admitsPlatformRetrieval(now = new Date()): Promise<boolean> {
    if (env.APP_MODE === "self-hosted") return false;
    return this.repo.admitsHostedAiRetrievalUnscoped(now);
  }

  async accruePlatformUsage(args: { purpose: "docsIndexing"; charge: AgentRetrievalCharge; now?: Date }) {
    assertMicrocentCount(args.charge.costMicrocents, "Platform AI cost");
    assertMicrocentCount(args.charge.inputTokens, "Platform AI input tokens");
    if (args.charge.costMicrocents === 0 && args.charge.inputTokens === 0) return;
    await this.repo.accruePlatformUsageUnscoped({
      purpose: args.purpose,
      charge: args.charge,
      now: args.now ?? new Date(),
    });
  }

  async reservePlatformRetrieval(args: {
    purpose: "docsIndexing";
    model: string;
    worstCaseMicrocents: number;
    now?: Date;
  }): Promise<string | null> {
    assertMicrocentCount(args.worstCaseMicrocents, "Platform AI reservation");
    if (env.APP_MODE === "self-hosted" || env.APP_MODE === "demo") return null;
    return this.repo.reservePlatformUsageUnscoped({
      purpose: args.purpose,
      model: args.model,
      reservedMicrocents: Math.max(1, args.worstCaseMicrocents),
      now: args.now ?? new Date(),
    });
  }

  async settlePlatformRetrieval(args: {
    reservationId: string;
    charge: AgentRetrievalCharge | null;
    now?: Date;
  }): Promise<void> {
    if (args.charge) {
      assertMicrocentCount(args.charge.costMicrocents, "Platform AI cost");
      assertMicrocentCount(args.charge.inputTokens, "Platform AI input tokens");
    }
    await this.repo.settlePlatformUsageUnscoped({
      ...args,
      now: args.now ?? new Date(),
    });
  }

  async reserveRetrieval(args: {
    grant: AgentRetrievalGrant;
    worstCaseMicrocents: number;
    model: string;
    now?: Date;
  }): Promise<AgentRetrievalReservation | null> {
    assertMicrocentCount(args.worstCaseMicrocents, "Retrieval reservation");
    if ((args.grant.purpose === "wikiIndexing") !== (args.grant.userId === null))
      throw new Error("Retrieval grant payer is invalid.");
    const reservedMicrocents = Math.max(1, args.worstCaseMicrocents);
    const reservedAt = args.now ?? new Date();
    const id = await this.repo.reserveRetrievalUsageUnscoped({
      grant: args.grant,
      reservedMicrocents,
      model: args.model,
      now: reservedAt,
    });
    return id ? { id, grant: args.grant, reservedMicrocents, reservedAt } : null;
  }

  async settleRetrieval(args: {
    reservation: AgentRetrievalReservation;
    charge: AgentRetrievalCharge | null;
    payer?: AgentRetrievalPayer;
    now?: Date;
  }) {
    if (args.charge) {
      assertMicrocentCount(args.charge.costMicrocents, "Retrieval cost");
      assertMicrocentCount(args.charge.inputTokens, "Retrieval input tokens");
    }
    await this.repo.settleRetrievalUsageUnscoped({
      grant: args.reservation.grant,
      reservationId: args.reservation.id,
      reservedMicrocents: args.reservation.reservedMicrocents,
      reservedAt: args.reservation.reservedAt,
      charge: args.charge,
      payer: args.payer ?? "grant",
      now: args.now ?? new Date(),
    });
  }

  async releaseStaleRetrievalReservations(now = new Date()): Promise<number> {
    return this.repo.releaseStaleRetrievalReservationsUnscoped({
      reservedBefore: new Date(now.getTime() - AGENT_RETRIEVAL_RESERVATION_TTL_MS),
      now,
    });
  }

  async settleStalePlatformReservations(now = new Date()): Promise<number> {
    return this.repo.settleStalePlatformReservationsUnscoped({
      reservedBefore: new Date(now.getTime() - AGENT_RETRIEVAL_RESERVATION_TTL_MS),
      now,
    });
  }

  async reserveUsage(args: {
    reservationId: string;
    companyId: string;
    userId: string;
    reservation: AgentTurnCreditReservation;
  }): Promise<boolean> {
    return this.repo.reserveUsageEventUnscoped({
      id: args.reservationId,
      companyId: args.companyId,
      userId: args.userId,
      sessionId: args.reservationId,
      reservedMicrocents: args.reservation.reservedMicrocents,
      planSnapshot: args.reservation.planSnapshot,
      subscriptionStatusSnapshot: args.reservation.subscriptionStatusSnapshot,
      allowanceMicrocentsSnapshot: args.reservation.allowanceMicrocentsSnapshot,
      periodStart: args.reservation.periodStart,
      periodEnd: args.reservation.periodEnd,
    });
  }

  async releaseReservation(args: { reservationId: string; companyId: string; userId: string; now?: Date }) {
    await this.repo.releaseUsageReservationUnscoped({
      id: args.reservationId,
      companyId: args.companyId,
      userId: args.userId,
      releasedAt: args.now ?? new Date(),
    });
  }
}
