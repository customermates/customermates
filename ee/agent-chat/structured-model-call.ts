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
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

const TIMEOUT_MS = 90_000;

function promptTokens(system: string, prompt: string) {
  return (
    Math.ceil(Buffer.byteLength(system + prompt, "utf8") / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) +
    AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS
  );
}

function estimatedCharge(model: AgentModelEntry, inputTokens: number, outputTokens: number): AgentRetrievalCharge {
  return {
    model: model.modelId,
    inputTokens,
    costMicrocents: computeCostMicrocents(
      model.modelId,
      { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model.servingProvider,
      model.inferenceRegion,
    ),
    costSource: "estimated",
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

function callFailure(label: string, model: string, error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const status =
    typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? ` HTTP ${error.statusCode}`
      : "";
  return `${label} model call to ${model} failed: ${name}${status}.`;
}

export function structuredCallWorstCaseMicrocents(model: AgentModelEntry, system: string, prompt: string): number {
  return estimatedCharge(model, promptTokens(system, prompt), model.maxOutputTokens).costMicrocents;
}

export async function generateStructuredObject<T>(args: {
  label: string;
  model: AgentModelEntry;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<{ output: T | null; charge: AgentRetrievalCharge | null; failure?: string }> {
  const inputTokens = promptTokens(args.system, args.prompt);
  try {
    const result = await generateText({
      model: args.model.modelId,
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
      maxOutputTokens: args.model.maxOutputTokens,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      providerOptions: {
        ...getAgentProviderOptions(args.model.servingProvider, args.model.inferenceRegion),
        ...googleThinkingProviderOptions(args.model),
      },
    });
    const usage = result.usage;
    const reading = readAgentProviderCharge(result.providerMetadata, args.model.servingProvider);
    const charge: AgentRetrievalCharge =
      reading.outcome === "unreadable"
        ? estimatedCharge(
            args.model,
            usage.inputTokens ?? inputTokens,
            usage.outputTokens ?? args.model.maxOutputTokens,
          )
        : {
            model: args.model.modelId,
            inputTokens: usage.inputTokens ?? inputTokens,
            costMicrocents: reading.outcome === "measured" ? reading.charge.costMicrocents : 0,
            costSource: "measured",
          };
    return { output: result.output, charge };
  } catch (error) {
    const failure = callFailure(args.label, args.model.modelId, error);
    if (rejectedBeforeGeneration(error)) return { output: null, charge: null, failure };
    const usage = NoObjectGeneratedError.isInstance(error) ? error.usage : undefined;
    return {
      output: null,
      failure,
      charge: estimatedCharge(
        args.model,
        usage?.inputTokens ?? inputTokens,
        usage?.outputTokens ?? args.model.maxOutputTokens,
      ),
    };
  }
}
