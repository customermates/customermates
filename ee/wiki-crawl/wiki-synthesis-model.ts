import type { z } from "zod";
import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";
import type { AgentRetrievalCharge } from "@/ee/agent-chat/agent-usage.service";

import { generateText, NoObjectGeneratedError, Output } from "ai";

import {
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
} from "@/ee/agent-chat/agent-model";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import { googleThinkingProviderOptions } from "@/ee/agent-chat/agent-thinking-options";
import { readAgentServedCharge } from "@/ee/agent-chat/gateway-cost";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { resolveAgentLanguageModel } from "@/ee/agent-chat/ovh-ai-endpoints";
import { agentServingProviderUsesGateway } from "@/ee/agent-chat/ovh-ai-endpoints-catalog";

const TIMEOUT_MS = 180_000;

function promptTokens(system: string, prompt: string) {
  return (
    Math.ceil(Buffer.byteLength(system + prompt, "utf8") / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) +
    AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS
  );
}

function tokenPricedCharge(
  model: AgentModelEntry,
  inputTokens: number,
  outputTokens: number,
  costSource: AgentRetrievalCharge["costSource"],
): AgentRetrievalCharge {
  return {
    model: model.modelId,
    inputTokens,
    costMicrocents: computeCostMicrocents(
      model.modelId,
      { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model.servingProvider,
      model.inferenceRegion,
    ),
    costSource,
  };
}

function estimatedCharge(model: AgentModelEntry, inputTokens: number, outputTokens: number): AgentRetrievalCharge {
  return tokenPricedCharge(model, inputTokens, outputTokens, "estimated");
}

function isReportedTokenCount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function servedCharge(
  model: AgentModelEntry,
  usage: { inputTokens?: number; outputTokens?: number },
  providerMetadata: unknown,
  inputTokens: number,
): AgentRetrievalCharge {
  const reading = readAgentServedCharge(providerMetadata, model.servingProvider);
  if (
    reading.outcome === "tokenPriced" &&
    isReportedTokenCount(usage.inputTokens) &&
    isReportedTokenCount(usage.outputTokens)
  )
    return tokenPricedCharge(model, usage.inputTokens, usage.outputTokens, "measured");
  if (reading.outcome === "unreadable" || reading.outcome === "tokenPriced")
    return estimatedCharge(model, usage.inputTokens ?? inputTokens, usage.outputTokens ?? model.maxOutputTokens);
  return {
    model: model.modelId,
    inputTokens: usage.inputTokens ?? inputTokens,
    costMicrocents: reading.outcome === "measured" ? reading.charge.costMicrocents : 0,
    costSource: "measured",
  };
}

const GATEWAY_REJECTIONS = new Set([
  "GatewayAuthenticationError",
  "GatewayForbiddenError",
  "GatewayInvalidRequestError",
  "GatewayModelNotFoundError",
  "GatewayNotFoundError",
  "GatewayRateLimitError",
]);

function rejectedBeforeGeneration(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (GATEWAY_REJECTIONS.has(error.name)) return true;
  const status = "statusCode" in error ? error.statusCode : null;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408;
}

function synthesisFailure(model: string, error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const status =
    typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? ` HTTP ${error.statusCode}`
      : "";
  return `Website import model call to ${model} failed: ${name}${status}.`;
}

export function wikiSynthesisWorstCaseMicrocents(model: AgentModelEntry, system: string, prompt: string): number {
  return estimatedCharge(model, promptTokens(system, prompt), model.maxOutputTokens).costMicrocents;
}

export async function generateWikiSynthesisObject<T>(args: {
  model: AgentModelEntry;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<{ output: T | null; charge: AgentRetrievalCharge | null; failure?: string }> {
  const inputTokens = promptTokens(args.system, args.prompt);
  let languageModel: ReturnType<typeof resolveAgentLanguageModel> | string;
  try {
    languageModel = resolveAgentLanguageModel(args.model.modelId) ?? args.model.modelId;
  } catch (error) {
    return { output: null, charge: null, failure: synthesisFailure(args.model.modelId, error) };
  }
  try {
    const result = await generateText({
      model: languageModel,
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
      maxOutputTokens: args.model.maxOutputTokens,
      ...(args.model.reasoningEffort ? { reasoning: args.model.reasoningEffort } : {}),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      providerOptions: {
        ...getAgentProviderOptions(args.model.servingProvider, args.model.inferenceRegion),
        ...googleThinkingProviderOptions(args.model),
      },
    });
    return {
      output: result.output,
      charge: servedCharge(args.model, result.usage, result.providerMetadata, inputTokens),
    };
  } catch (error) {
    const failure = synthesisFailure(args.model.modelId, error);
    if (rejectedBeforeGeneration(error)) return { output: null, charge: null, failure };
    const usage = NoObjectGeneratedError.isInstance(error) ? error.usage : undefined;
    const reported =
      usage !== undefined &&
      !agentServingProviderUsesGateway(args.model.servingProvider) &&
      isReportedTokenCount(usage.inputTokens) &&
      isReportedTokenCount(usage.outputTokens);
    return {
      output: null,
      failure,
      charge: reported
        ? tokenPricedCharge(args.model, usage.inputTokens ?? 0, usage.outputTokens ?? 0, "measured")
        : estimatedCharge(
            args.model,
            usage?.inputTokens ?? inputTokens,
            usage?.outputTokens ?? args.model.maxOutputTokens,
          ),
    };
  }
}
