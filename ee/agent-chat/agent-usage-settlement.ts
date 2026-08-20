import { agentCreditsForStartedProviderCost } from "./agent-credit-policy";
import { computeCostMicrocents, type TokenCounts } from "./model-pricing";

export type AgentUsageSettlement = TokenCounts & {
  model: string;
  costMicrocents: number;
  reservedCredits: number;
  chargedCredits: number;
  policyBreach: boolean;
  state: "settled" | "retained";
};

export function buildAgentUsageSettlement(args: {
  model: string;
  tokens: TokenCounts;
  reservedCredits: number;
  retainReservation: boolean;
}): AgentUsageSettlement {
  if (!Number.isSafeInteger(args.reservedCredits) || args.reservedCredits < 1)
    throw new Error("Agent usage reservation credits are invalid.");

  const costMicrocents = computeCostMicrocents(args.model, args.tokens);
  const meteredCredits = agentCreditsForStartedProviderCost(costMicrocents);
  const policyBreach = meteredCredits > args.reservedCredits;

  return {
    ...args.tokens,
    model: args.model,
    costMicrocents,
    reservedCredits: args.reservedCredits,
    chargedCredits: args.retainReservation ? args.reservedCredits : Math.min(meteredCredits, args.reservedCredits),
    policyBreach,
    state: args.retainReservation ? "retained" : "settled",
  };
}
