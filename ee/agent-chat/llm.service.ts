import type { LanguageModelUsage } from "ai";

import type { TokenCounts } from "./model-pricing";
import { buildAgentUsageSettlement, type AgentProviderChargeEvidence } from "./agent-usage-settlement";

export function buildTurnUsageSettlement(
  modelSpec: string,
  tokens: TokenCounts,
  options: {
    provider: string;
    reservedCredits: number;
    providerCharge: AgentProviderChargeEvidence;
    retainReservation?: boolean;
  },
) {
  return buildAgentUsageSettlement({
    model: modelSpec,
    provider: options.provider,
    tokens,
    reservedCredits: options.reservedCredits,
    providerCharge: options.providerCharge,
    retainReservation: Boolean(options.retainReservation),
  });
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
