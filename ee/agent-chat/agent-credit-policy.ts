import { z } from "zod";

import type { AppMode } from "@/core/config/environment";
import { SubscriptionStatus, type SubscriptionPlan } from "@/generated/prisma";
import type { Data } from "@/core/validation/validation.utils";
import { assertValidDate } from "@/core/utils/date";

import { getEntitlements, TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER } from "@/ee/subscription/entitlements";

export const AGENT_CREDIT_MICROCENTS = 1_000_000;

export const AgentCreditEntitlementBlockedReasonSchema = z.enum([
  "self_hosted",
  "subscription_unavailable",
  "enterprise_allowance_missing",
]);

export type AgentCreditEntitlementBlockedReason = Data<typeof AgentCreditEntitlementBlockedReasonSchema>;

export type AgentCreditPeriod = {
  start: Date;
  resetAt: Date;
};

export type AgentCreditEntitlement = AgentCreditPeriod & {
  plan: SubscriptionPlan;
  limit: number;
  blockedReason: AgentCreditEntitlementBlockedReason | null;
};

type AgentCreditEntitlementInput = {
  appMode: AppMode;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndDate: Date | null;
  creditAnchorAt: Date;
  enterpriseCreditsPerUser: number | null;
  activeSeatAt: Date | null;
  now: Date;
};

function anchoredOccurrence(anchor: Date, year: number, zeroBasedMonth: number) {
  const normalizedMonth = new Date(Date.UTC(year, zeroBasedMonth, 1));
  const normalizedYear = normalizedMonth.getUTCFullYear();
  const normalizedZeroBasedMonth = normalizedMonth.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(normalizedYear, normalizedZeroBasedMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      normalizedYear,
      normalizedZeroBasedMonth,
      Math.min(anchor.getUTCDate(), daysInMonth),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

export function agentCreditPeriodForAnchor(anchor: Date, now: Date): AgentCreditPeriod {
  assertValidDate(anchor, "AI credit anchor");
  assertValidDate(now, "AI credit period time");
  if (anchor.getTime() > now.getTime()) throw new Error("AI credit anchor cannot be in the future.");

  const occurrenceThisMonth = anchoredOccurrence(anchor, now.getUTCFullYear(), now.getUTCMonth());
  const start =
    occurrenceThisMonth.getTime() <= now.getTime()
      ? occurrenceThisMonth
      : anchoredOccurrence(anchor, now.getUTCFullYear(), now.getUTCMonth() - 1);
  const resetAt = anchoredOccurrence(anchor, start.getUTCFullYear(), start.getUTCMonth() + 1);

  return { start, resetAt };
}

export function prorateAgentCreditsForSeat(
  fullAllowance: number,
  activeSeatAt: Date | null,
  period: AgentCreditPeriod,
) {
  if (!Number.isSafeInteger(fullAllowance) || fullAllowance < 0)
    throw new Error("AI credit allowance must be a non-negative whole number.");
  if (!activeSeatAt || activeSeatAt.getTime() <= period.start.getTime()) return fullAllowance;
  assertValidDate(activeSeatAt, "AI credit active-seat time");
  if (activeSeatAt.getTime() >= period.resetAt.getTime()) return 0;

  const periodMs = period.resetAt.getTime() - period.start.getTime();
  const remainingMs = period.resetAt.getTime() - activeSeatAt.getTime();
  if (!Number.isSafeInteger(periodMs) || periodMs <= 0 || !Number.isSafeInteger(remainingMs) || remainingMs <= 0)
    throw new Error("AI credit proration period is invalid.");

  const numerator = BigInt(fullAllowance) * BigInt(remainingMs);
  const denominator = BigInt(periodMs);
  const prorated = (numerator + denominator - 1n) / denominator;
  const result = Number(prorated);
  if (!Number.isSafeInteger(result)) throw new Error("Prorated AI credit allowance is invalid.");
  return result;
}

function paidPlanAllowance(plan: SubscriptionPlan, enterpriseCreditsPerUser: number | null) {
  const configured = getEntitlements(plan).hostedAiCreditsPerActiveUser;
  if (typeof configured === "number") return { allowance: configured, missingEnterpriseAllowance: false };

  const validEnterpriseAllowance =
    Number.isSafeInteger(enterpriseCreditsPerUser) && (enterpriseCreditsPerUser ?? -1) > 0
      ? enterpriseCreditsPerUser
      : null;
  return {
    allowance: validEnterpriseAllowance ?? 0,
    missingEnterpriseAllowance: validEnterpriseAllowance === null,
  };
}

export function resolveAgentCreditEntitlement(input: AgentCreditEntitlementInput): AgentCreditEntitlement {
  const period = agentCreditPeriodForAnchor(input.creditAnchorAt, input.now);

  if (input.appMode === "self-hosted") {
    return {
      ...period,
      plan: input.plan,
      limit: 0,
      blockedReason: "self_hosted",
    };
  }

  const usableTrial =
    input.status === SubscriptionStatus.trial &&
    (input.trialEndDate === null || input.trialEndDate.getTime() >= input.now.getTime());
  const usablePaid = input.status === SubscriptionStatus.active;
  if (!usableTrial && !usablePaid) {
    return {
      ...period,
      plan: input.plan,
      limit: 0,
      blockedReason: "subscription_unavailable",
    };
  }

  if (usableTrial) {
    return {
      ...period,
      plan: input.plan,
      limit: TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER,
      blockedReason: null,
    };
  }

  const paid = paidPlanAllowance(input.plan, input.enterpriseCreditsPerUser);
  if (paid.missingEnterpriseAllowance) {
    return {
      ...period,
      plan: input.plan,
      limit: 0,
      blockedReason: "enterprise_allowance_missing",
    };
  }

  if (
    input.activeSeatAt === null ||
    !(input.activeSeatAt instanceof Date) ||
    !Number.isFinite(input.activeSeatAt.getTime()) ||
    input.activeSeatAt.getTime() > input.now.getTime()
  ) {
    return {
      ...period,
      plan: input.plan,
      limit: 0,
      blockedReason: "subscription_unavailable",
    };
  }

  return {
    ...period,
    plan: input.plan,
    limit: prorateAgentCreditsForSeat(paid.allowance, input.activeSeatAt, period),
    blockedReason: null,
  };
}

export function agentCreditsForStartedProviderCost(costMicrocents: number) {
  if (!Number.isSafeInteger(costMicrocents) || costMicrocents < 0)
    throw new Error("AI provider cost must be a non-negative whole number of microcents.");
  return Math.max(1, Math.ceil(costMicrocents / AGENT_CREDIT_MICROCENTS));
}
