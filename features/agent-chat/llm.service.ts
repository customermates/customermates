import type { LanguageModelUsage } from "ai";

import { createOpenAI } from "@ai-sdk/openai";

import type { TokenCounts } from "./model-pricing";
import { buildAgentUsageSettlement } from "./agent-usage-settlement";

export const AGENT_MODEL_ID = "gpt-5.6-luna";

const openai = createOpenAI();

export type AgentModelLane = "agent";

export function laneModel(_lane: AgentModelLane) {
  return openai(AGENT_MODEL_ID);
}

export function laneModelId(_lane: AgentModelLane) {
  return AGENT_MODEL_ID;
}

export function buildLaneUsageSettlement(
  lane: AgentModelLane,
  tokens: TokenCounts,
  options: { reservedCredits: number; retainReservation?: boolean },
) {
  return buildAgentUsageSettlement({
    model: laneModelId(lane),
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
  const cacheReadTokens = tokenCount("cacheReadTokens", details?.cacheReadTokens ?? usage.cachedInputTokens);
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
  return typeof usage.inputTokens === "number" && typeof usage.outputTokens === "number";
}
