import type { LanguageModelUsage } from "ai";

import type { TokenCounts } from "./model-pricing";
import { buildAgentUsageSettlement } from "./agent-usage-settlement";

export function buildTurnUsageSettlement(
  modelSpec: string,
  tokens: TokenCounts,
  options: { reservedCredits: number; retainReservation?: boolean },
) {
  return buildAgentUsageSettlement({
    model: modelSpec,
    tokens,
    reservedCredits: options.reservedCredits,
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

export function hasProviderUsageEvidence(usage: LanguageModelUsage) {
  const isTokenCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
  const details = usage.inputTokenDetails;
  if (
    !isTokenCount(usage.inputTokens) ||
    !isTokenCount(usage.outputTokens) ||
    !isTokenCount(details?.noCacheTokens) ||
    !isTokenCount(details.cacheReadTokens) ||
    !isTokenCount(details.cacheWriteTokens)
  )
    return false;
  return details.noCacheTokens + details.cacheReadTokens + details.cacheWriteTokens === usage.inputTokens;
}
