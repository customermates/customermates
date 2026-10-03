import type { LanguageModelUsage } from "ai";

import { computeCostMicrocents, type ModelInferenceRegion, type TokenCounts } from "./model-pricing";

export type AgentUsageCostSource = "measured" | "estimated";

export type AgentProviderChargeEvidence = {
  billed: boolean;
  measuredCostMicrocents: number | null;
  estimatedCostMicrocents?: number;
  stepTokens: readonly TokenCounts[];
  unreadableReason: string | null;
};

type AgentAuxiliaryCharge = {
  costMicrocents: number;
  measured: boolean;
};

export type AgentUsageSettlement = TokenCounts & {
  model: string;
  costMicrocents: number;
  costSource: AgentUsageCostSource;
  reservedMicrocents: number;
  chargedMicrocents: number;
  policyBreach: boolean;
  state: "settled";
};

function estimateCostMicrocents(args: {
  model: string;
  provider?: string;
  inferenceRegion?: ModelInferenceRegion | null;
  tokens: TokenCounts;
  providerCharge: AgentProviderChargeEvidence;
}) {
  const steps = args.providerCharge.stepTokens;
  if (steps.length === 0) return computeCostMicrocents(args.model, args.tokens, args.provider, args.inferenceRegion);

  return steps.reduce(
    (total, step) => total + computeCostMicrocents(args.model, step, args.provider, args.inferenceRegion),
    0,
  );
}

export function buildAgentUsageSettlement(args: {
  model: string;
  provider?: string;
  inferenceRegion?: ModelInferenceRegion | null;
  tokens: TokenCounts;
  reservedMicrocents: number;
  providerCharge: AgentProviderChargeEvidence;
  auxiliary?: AgentAuxiliaryCharge;
}): AgentUsageSettlement {
  if (!Number.isSafeInteger(args.reservedMicrocents) || args.reservedMicrocents < 1)
    throw new Error("Agent usage reservation microcents are invalid.");
  const auxiliary = args.auxiliary ?? { costMicrocents: 0, measured: true };
  if (!Number.isSafeInteger(auxiliary.costMicrocents) || auxiliary.costMicrocents < 0)
    throw new Error("Agent auxiliary usage cost is invalid.");

  const base = { ...args.tokens, model: args.model, reservedMicrocents: args.reservedMicrocents };

  if (!args.providerCharge.billed && auxiliary.costMicrocents === 0) {
    return {
      ...base,
      costMicrocents: 0,
      costSource: "measured",
      chargedMicrocents: 0,
      policyBreach: false,
      state: "settled",
    };
  }

  const measured = args.providerCharge.billed ? args.providerCharge.measuredCostMicrocents : 0;
  const costSource: AgentUsageCostSource = measured !== null && auxiliary.measured ? "measured" : "estimated";
  const costMicrocents =
    (measured ?? args.providerCharge.estimatedCostMicrocents ?? estimateCostMicrocents(args)) +
    auxiliary.costMicrocents;
  if (!Number.isSafeInteger(costMicrocents) || costMicrocents < 0)
    throw new Error("AI provider cost must be a non-negative whole number of microcents.");

  return {
    ...base,
    costMicrocents,
    costSource,
    chargedMicrocents: Math.min(costMicrocents, args.reservedMicrocents),
    policyBreach: costMicrocents > args.reservedMicrocents,
    state: "settled",
  };
}

export function usageToTokenCounts(usage: LanguageModelUsage): TokenCounts {
  const tokenCount = (name: string, value: number | undefined) => {
    const resolved = value ?? 0;
    if (!Number.isSafeInteger(resolved) || resolved < 0)
      throw new Error(`Invalid ${name} reported by the AI provider.`);
    return resolved;
  };
  const details = usage.inputTokenDetails;
  const cacheReadTokens = tokenCount("cacheReadTokens", details?.cacheReadTokens);
  const cacheWriteTokens = tokenCount("cacheWriteTokens", details?.cacheWriteTokens);
  const totalInputTokens = tokenCount("inputTokens", usage.inputTokens);
  const inputTokens =
    details?.noCacheTokens == null
      ? Math.max(0, totalInputTokens - cacheReadTokens - cacheWriteTokens)
      : tokenCount("noCacheTokens", details.noCacheTokens);

  return {
    inputTokens,
    outputTokens: tokenCount("outputTokens", usage.outputTokens),
    cacheReadTokens,
    cacheWriteTokens,
  };
}
