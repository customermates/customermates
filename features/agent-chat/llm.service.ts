import type { LanguageModelUsage } from "ai";

import { createProviderRegistry } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

import { getAgentUsageService } from "@/core/di";
import { env } from "@/env";

import type { TokenCounts } from "./model-pricing";
import { buildAgentUsageSettlement } from "./agent-usage-settlement";

const registry = createProviderRegistry({
  anthropic: createAnthropic(),
  google: createGoogleGenerativeAI(),
  openai: createOpenAI(),
});

export type AgentModelLane = "agent";

function laneSpec(_lane: AgentModelLane) {
  return env.AGENT_MODEL;
}

type ProviderModelSpec = `anthropic:${string}` | `google:${string}` | `openai:${string}`;

export function laneModel(lane: AgentModelLane) {
  return registry.languageModel(laneSpec(lane) as ProviderModelSpec);
}

export function laneModelId(lane: AgentModelLane) {
  const spec = laneSpec(lane);
  const colon = spec.indexOf(":");
  return colon === -1 ? spec : spec.slice(colon + 1);
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

export type LlmUsageContext = {
  companyId: string;
  userId: string;
  sessionId: string;
  reservedCredits: number;
};

export async function recordLaneTokens(
  ctx: LlmUsageContext,
  lane: AgentModelLane,
  tokens: TokenCounts,
  options: { retainReservation?: boolean } = {},
) {
  if (env.AGENT_GATEWAY_DEBUG) {
    console.log(
      JSON.stringify({
        tag: "agent-lane-usage",
        lane,
        sessionId: ctx.sessionId,
        ...tokens,
      }),
    );
  }

  await getAgentUsageService().recordUsage({
    companyId: ctx.companyId,
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    model: laneModelId(lane),
    tokens,
    reservedCredits: ctx.reservedCredits,
    retainReservation: options.retainReservation,
  });
}

export async function releaseLaneReservation(ctx: LlmUsageContext) {
  await getAgentUsageService().releaseReservation({
    reservationId: ctx.sessionId,
    companyId: ctx.companyId,
    userId: ctx.userId,
  });
}

export async function recordLaneUsage(ctx: LlmUsageContext, lane: AgentModelLane, usage: LanguageModelUsage) {
  await recordLaneTokens(ctx, lane, usageToTokenCounts(usage));
}
