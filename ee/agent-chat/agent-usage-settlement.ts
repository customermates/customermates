import { agentCreditsForStartedProviderCost } from "./agent-credit-policy";
import { computeCostMicrocents, type TokenCounts } from "./model-pricing";

export type AgentUsageCostSource = "measured" | "estimated";

export type AgentProviderChargeEvidence = {
  billed: boolean;
  measuredCostMicrocents: number | null;
  stepTokens: readonly TokenCounts[];
  unreadableReason: string | null;
};

export type AgentUsageSettlement = TokenCounts & {
  model: string;
  costMicrocents: number;
  costSource: AgentUsageCostSource;
  reservedCredits: number;
  chargedCredits: number;
  policyBreach: boolean;
  state: "settled" | "retained";
};

function estimateCostMicrocents(args: {
  model: string;
  provider?: string;
  tokens: TokenCounts;
  providerCharge: AgentProviderChargeEvidence;
}) {
  const steps = args.providerCharge.stepTokens;
  if (steps.length === 0) return computeCostMicrocents(args.model, args.tokens, args.provider);

  return steps.reduce((total, step) => total + computeCostMicrocents(args.model, step, args.provider), 0);
}

export function buildAgentUsageSettlement(args: {
  model: string;
  provider?: string;
  tokens: TokenCounts;
  reservedCredits: number;
  providerCharge: AgentProviderChargeEvidence;
  retainReservation: boolean;
}): AgentUsageSettlement {
  if (!Number.isSafeInteger(args.reservedCredits) || args.reservedCredits < 1)
    throw new Error("Agent usage reservation credits are invalid.");

  const base = { ...args.tokens, model: args.model, reservedCredits: args.reservedCredits };

  if (!args.providerCharge.billed) {
    return {
      ...base,
      costMicrocents: 0,
      costSource: "measured",
      chargedCredits: 0,
      policyBreach: false,
      state: "settled",
    };
  }

  const measured = args.providerCharge.measuredCostMicrocents;
  const costSource: AgentUsageCostSource = measured === null ? "estimated" : "measured";
  const costMicrocents = measured ?? estimateCostMicrocents(args);
  const meteredCredits = agentCreditsForStartedProviderCost(costMicrocents);

  return {
    ...base,
    costMicrocents,
    costSource,
    chargedCredits: args.retainReservation ? args.reservedCredits : Math.min(meteredCredits, args.reservedCredits),
    policyBreach: meteredCredits > args.reservedCredits,
    state: args.retainReservation ? "retained" : "settled",
  };
}
