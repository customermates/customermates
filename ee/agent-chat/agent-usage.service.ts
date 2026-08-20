import { z } from "zod";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { env } from "@/env";
import type { Data } from "@/core/validation/validation.utils";

import { resolveAgentCreditEntitlement, AgentCreditEntitlementBlockedReasonSchema } from "./agent-credit-policy";
import { resolveAgentTurnBudget, type AgentTurnBudget } from "./agent-budget-policy";

export type AgentUsageLedgerState = "reserved" | "settled" | "retained" | "released";

export abstract class AgentUsageRepo {
  abstract getUserCreditUsageUnscoped(
    companyId: string,
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ usedCredits: number; recentTurnCredits: number | null }>;
  abstract findUserForUsageUnscoped(userId: string): Promise<{
    id: string;
    companyId: string;
    status: Status;
    createdAt: Date;
    agentCreditActivatedAt: Date | null;
    subscription: {
      status: SubscriptionStatus;
      plan: SubscriptionPlan;
      trialEndDate: Date | null;
      agentCreditAnchorAt: Date | null;
      enterpriseAgentCreditsPerUser: number | null;
      createdAt: Date;
    } | null;
  } | null>;
  abstract reserveUsageEventUnscoped(event: {
    id: string;
    companyId: string;
    userId: string;
    sessionId: string;
    reservedCredits: number;
    planSnapshot: SubscriptionPlan;
    subscriptionStatusSnapshot: SubscriptionStatus;
    allowanceCreditsSnapshot: number;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<void>;
  abstract releaseUsageReservationUnscoped(args: {
    id: string;
    companyId: string;
    userId: string;
    releasedAt: Date;
  }): Promise<void>;
}

export const AgentUsageBlockedReasonSchema = z.enum([
  ...AgentCreditEntitlementBlockedReasonSchema.options,
  "credits_exhausted",
  "configuration_unavailable",
]);

export type AgentUsageBlockedReason = Data<typeof AgentUsageBlockedReasonSchema>;

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
  reservedCredits: number;
  planSnapshot: SubscriptionPlan;
  subscriptionStatusSnapshot: SubscriptionStatus;
  allowanceCreditsSnapshot: number;
  periodStart: Date;
  periodEnd: Date;
  budget: AgentTurnBudget;
};

type ResolvedUsageState = {
  user: NonNullable<Awaited<ReturnType<AgentUsageRepo["findUserForUsageUnscoped"]>>>;
  summary: AgentUsageSummary;
};

function usagePct(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function assertCreditCount(value: number, description: string) {
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
    const usage = await this.repo.getUserCreditUsageUnscoped(
      user.companyId,
      userId,
      entitlement.start,
      entitlement.resetAt,
    );
    assertCreditCount(usage.usedCredits, "Stored AI credit usage");
    if (usage.recentTurnCredits !== null) assertCreditCount(usage.recentTurnCredits, "Recent AI turn credits");

    const activeSeat = user.status === Status.active;
    const creditsLimit = activeSeat ? entitlement.limit : 0;
    const creditsRemaining = Math.max(0, creditsLimit - usage.usedCredits);
    const blockedReason = activeSeat
      ? (entitlement.blockedReason ?? (creditsRemaining === 0 ? ("credits_exhausted" as const) : null))
      : ("subscription_unavailable" as const);

    return {
      user,
      summary: {
        creditsUsed: usage.usedCredits,
        creditsRemaining,
        creditsLimit,
        usedPct: usagePct(usage.usedCredits, creditsLimit),
        plan: entitlement.plan,
        periodStart: entitlement.start,
        resetAt: entitlement.resetAt,
        recentTurnCredits: usage.recentTurnCredits,
        blockedReason,
      },
    };
  }

  async getUsageSummary(userId: string, now = new Date()): Promise<AgentUsageSummary> {
    return (await this.resolveUsageState(userId, now)).summary;
  }

  async prepareTurn(
    userId: string,
    now = new Date(),
    requiredContextBytes?: number,
  ): Promise<{
    summary: AgentUsageSummary;
    reservation: AgentTurnCreditReservation | null;
  }> {
    const state = await this.resolveUsageState(userId, now);
    if (state.summary.blockedReason) return { summary: state.summary, reservation: null };
    if (!state.user.subscription || !state.summary.plan) {
      return {
        summary: { ...state.summary, blockedReason: "configuration_unavailable" },
        reservation: null,
      };
    }

    const budget = resolveAgentTurnBudget({
      availableCredits: state.summary.creditsRemaining,
      requiredContextBytes,
    });
    if (!budget) {
      return {
        summary: { ...state.summary, blockedReason: "configuration_unavailable" },
        reservation: null,
      };
    }

    return {
      summary: state.summary,
      reservation: {
        reservedCredits: budget.reservedCredits,
        planSnapshot: state.summary.plan,
        subscriptionStatusSnapshot: state.user.subscription.status,
        allowanceCreditsSnapshot: state.summary.creditsLimit,
        periodStart: state.summary.periodStart,
        periodEnd: state.summary.resetAt,
        budget,
      },
    };
  }

  async reserveUsage(args: {
    reservationId: string;
    companyId: string;
    userId: string;
    reservation: AgentTurnCreditReservation;
  }) {
    await this.repo.reserveUsageEventUnscoped({
      id: args.reservationId,
      companyId: args.companyId,
      userId: args.userId,
      sessionId: args.reservationId,
      reservedCredits: args.reservation.reservedCredits,
      planSnapshot: args.reservation.planSnapshot,
      subscriptionStatusSnapshot: args.reservation.subscriptionStatusSnapshot,
      allowanceCreditsSnapshot: args.reservation.allowanceCreditsSnapshot,
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
