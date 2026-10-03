import type { z } from "zod";
import type { AgentRetrievalCharge } from "@/ee/agent-chat/agent-usage.service";

import { generateText, NoObjectGeneratedError, Output } from "ai";

import { INITIAL_WIKI_SYNTHESIS_MODEL } from "@/ee/agent-chat/model-catalog";
import {
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
} from "@/ee/agent-chat/agent-model";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import { googleThinkingProviderOptions } from "@/ee/agent-chat/agent-thinking-options";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

const MODEL = INITIAL_WIKI_SYNTHESIS_MODEL;
const TIMEOUT_MS = 180_000;

function promptTokens(system: string, prompt: string) {
  return (
    Math.ceil(Buffer.byteLength(system + prompt, "utf8") / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) +
    AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS
  );
}

function estimatedCharge(inputTokens: number, outputTokens: number): AgentRetrievalCharge {
  return {
    model: MODEL.modelId,
    inputTokens,
    costMicrocents: computeCostMicrocents(
      MODEL.modelId,
      { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      MODEL.servingProvider,
      MODEL.inferenceRegion,
    ),
    costSource: "estimated",
  };
}

export function wikiSynthesisWorstCaseMicrocents(system: string, prompt: string): number {
  return estimatedCharge(promptTokens(system, prompt), MODEL.maxOutputTokens).costMicrocents;
}

export async function generateWikiSynthesisObject<T>(args: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<{ output: T | null; charge: AgentRetrievalCharge }> {
  const inputTokens = promptTokens(args.system, args.prompt);
  try {
    const result = await generateText({
      model: MODEL.modelId,
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
      maxOutputTokens: MODEL.maxOutputTokens,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      providerOptions: {
        ...getAgentProviderOptions(MODEL.servingProvider, MODEL.inferenceRegion),
        ...googleThinkingProviderOptions(MODEL),
      },
    });
    const usage = result.usage;
    const reading = readAgentProviderCharge(result.providerMetadata, MODEL.servingProvider);
    const charge: AgentRetrievalCharge =
      reading.outcome === "unreadable"
        ? estimatedCharge(usage.inputTokens ?? inputTokens, usage.outputTokens ?? MODEL.maxOutputTokens)
        : {
            model: MODEL.modelId,
            inputTokens: usage.inputTokens ?? inputTokens,
            costMicrocents: reading.outcome === "measured" ? reading.charge.costMicrocents : 0,
            costSource: "measured",
          };
    return { output: result.output, charge };
  } catch (error) {
    const usage = NoObjectGeneratedError.isInstance(error) ? error.usage : undefined;
    return { output: null, charge: estimatedCharge(usage?.inputTokens ?? inputTokens, usage?.outputTokens ?? 0) };
  }
}
