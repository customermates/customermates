import { z } from "zod";

import type { AppMode } from "@/core/config/environment";
import { SubscriptionStatus, type SubscriptionPlan } from "@/generated/prisma";
import type { Data } from "@/core/validation/validation.utils";
import { assertValidDate } from "@/core/utils/date";

import { agentCreditsToMicrocents } from "@/core/commercial/agent-credits";
import { CLOUD_TRIAL_HOSTED_AI_USAGE_MULTIPLIER } from "@/core/commercial/plan-catalog";
import { getEntitlements, TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER } from "@/ee/subscription/entitlements";

export {
  AGENT_CREDIT_MICROCENTS,
  AGENT_MICROCENTS_PER_USD,
  agentCreditsToMicrocents,
  agentMicrocentsToCredits,
} from "@/core/commercial/agent-credits";

export const AGENT_RETRIEVAL_RESERVATION_TTL_MS = 15 * 60 * 1000;
export const AGENT_RETRIEVAL_PLATFORM_PURPOSE = "wikiQueryEmbeddingUnused";

export function workspaceIndexingShareMicrocents(args: {
  unassignedMicrocents: number;
  memberLimitMicrocents: number;
  poolLimitMicrocents: number;
}): number {
  const { unassignedMicrocents, memberLimitMicrocents, poolLimitMicrocents } = args;
  if (unassignedMicrocents <= 0 || memberLimitMicrocents <= 0 || poolLimitMicrocents <= 0) return 0;
  const numerator = BigInt(unassignedMicrocents) * BigInt(memberLimitMicrocents);
  const denominator = BigInt(poolLimitMicrocents);
  return Number((numerator + denominator - 1n) / denominator);
}

export function memberCreditHeadroomMicrocents(args: {
  memberLimitMicrocents: number;
  memberUsedMicrocents: number;
  poolLimitMicrocents: number;
  poolUsedMicrocents: number;
}): number {
  return Math.max(
    0,
    Math.min(
      args.memberLimitMicrocents - args.memberUsedMicrocents,
      args.poolLimitMicrocents - args.poolUsedMicrocents,
    ),
  );
}

export function agentMicrocentsFromStorage(value: bigint | number | null | undefined, description: string): number {
  const microcents = typeof value === "bigint" ? Number(value) : (value ?? 0);
  if (!Number.isSafeInteger(microcents) || (typeof value === "bigint" && BigInt(microcents) !== value))
    throw new Error(`${description} is invalid.`);
  return microcents;
}

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
  limitMicrocents: number;
  blockedReason: AgentCreditEntitlementBlockedReason | null;
};

type AgentCreditEntitlementInput = {
  appMode: AppMode;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndDate: Date | null;
  creditAnchorAt: Date;
  enterpriseCreditsPerUser: number | null;
  adjustmentMicrocents?: number;
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

export function prorateAgentAllowanceForSeat(
  fullAllowanceMicrocents: number,
  activeSeatAt: Date | null,
  period: AgentCreditPeriod,
) {
  if (!Number.isSafeInteger(fullAllowanceMicrocents) || fullAllowanceMicrocents < 0)
    throw new Error("AI credit allowance must be a non-negative whole number of microcents.");
  if (!activeSeatAt || activeSeatAt.getTime() <= period.start.getTime()) return fullAllowanceMicrocents;
  assertValidDate(activeSeatAt, "AI credit active-seat time");
  if (activeSeatAt.getTime() >= period.resetAt.getTime()) return 0;

  const periodMs = period.resetAt.getTime() - period.start.getTime();
  const remainingMs = period.resetAt.getTime() - activeSeatAt.getTime();
  if (!Number.isSafeInteger(periodMs) || periodMs <= 0 || !Number.isSafeInteger(remainingMs) || remainingMs <= 0)
    throw new Error("AI credit proration period is invalid.");

  const numerator = BigInt(fullAllowanceMicrocents) * BigInt(remainingMs);
  const denominator = BigInt(periodMs);
  const prorated = (numerator + denominator - 1n) / denominator;
  const result = Number(prorated);
  if (!Number.isSafeInteger(result)) throw new Error("Prorated AI credit allowance is invalid.");
  return result;
}

function paidPlanAllowance(plan: SubscriptionPlan, enterpriseCreditsPerUser: number | null): number | null {
  const configured = getEntitlements(plan).hostedAiCreditsPerActiveUser;
  if (typeof configured === "number") return configured;

  const contracted =
    Number.isSafeInteger(enterpriseCreditsPerUser) && (enterpriseCreditsPerUser ?? -1) > 0
      ? enterpriseCreditsPerUser
      : null;

  return contracted;
}

function adjustedAllowance(baseAllowanceMicrocents: number, adjustmentMicrocents = 0): number {
  if (!Number.isSafeInteger(adjustmentMicrocents))
    throw new Error("AI credit adjustment must be a whole number of microcents.");

  const allowance = baseAllowanceMicrocents + adjustmentMicrocents;
  if (!Number.isSafeInteger(allowance) || allowance < 0) throw new Error("Adjusted AI credit allowance is invalid.");

  return allowance;
}

export function workspaceAgentCreditRate(input: {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndDate: Date | null;
  enterpriseCreditsPerUser: number | null;
  now: Date;
}): number | null {
  const usableTrial =
    input.status === SubscriptionStatus.trial &&
    (input.trialEndDate === null || input.trialEndDate.getTime() >= input.now.getTime());
  if (usableTrial) return TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER;
  if (input.status !== SubscriptionStatus.active) return null;

  return paidPlanAllowance(input.plan, input.enterpriseCreditsPerUser);
}

export function agentUsageMultiplier(input: {
  appMode: AppMode;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndDate: Date | null;
  now: Date;
}): number | null {
  if (input.appMode === "self-hosted") return null;
  const usableTrial =
    input.status === SubscriptionStatus.trial &&
    (input.trialEndDate === null || input.trialEndDate.getTime() >= input.now.getTime());
  if (usableTrial) return CLOUD_TRIAL_HOSTED_AI_USAGE_MULTIPLIER;
  if (input.status !== SubscriptionStatus.active) return null;

  const multiplier = getEntitlements(input.plan).hostedAiUsageMultiplier;
  return typeof multiplier === "number" ? multiplier : null;
}

export function resolveAgentCreditEntitlement(input: AgentCreditEntitlementInput): AgentCreditEntitlement {
  const period = agentCreditPeriodForAnchor(input.creditAnchorAt, input.now);

  if (input.appMode === "self-hosted") {
    return {
      ...period,
      plan: input.plan,
      limitMicrocents: 0,
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
      limitMicrocents: 0,
      blockedReason: "subscription_unavailable",
    };
  }

  if (usableTrial) {
    return {
      ...period,
      plan: input.plan,
      limitMicrocents: adjustedAllowance(
        agentCreditsToMicrocents(TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER),
        input.adjustmentMicrocents,
      ),
      blockedReason: null,
    };
  }

  const allowance = paidPlanAllowance(input.plan, input.enterpriseCreditsPerUser);
  if (allowance === null) {
    return {
      ...period,
      plan: input.plan,
      limitMicrocents: 0,
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
      limitMicrocents: 0,
      blockedReason: "subscription_unavailable",
    };
  }

  return {
    ...period,
    plan: input.plan,
    limitMicrocents: adjustedAllowance(
      prorateAgentAllowanceForSeat(agentCreditsToMicrocents(allowance), input.activeSeatAt, period),
      input.adjustmentMicrocents,
    ),
    blockedReason: null,
  };
}
