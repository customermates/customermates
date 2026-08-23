import type { AgentModelEntry } from "./model-catalog";

import {
  AGENT_CONTEXT_BYTES_PER_TOKEN,
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
  agentModelWorstCasePromptTokens,
  isAgentModelWithinBudgetEnvelope,
} from "./model-catalog";
import { resolveModelPricing } from "./model-pricing";

export const AGENT_MIN_STEPS_WITH_FULL_TOOL_CATALOG = 4;
export const AGENT_MAX_TOOL_RESULT_CHARS = 6000;
export const AGENT_MIN_OUTPUT_TOKENS_PER_STEP = 800;
export const AGENT_MIN_CONTEXT_TOKENS_PER_STEP = 8_000;
export const AGENT_MIN_TOOL_RESULT_CHARS = 512;
export const AGENT_CONTEXT_ACCUMULATION_STEPS = 3;

const AGENT_INTERSTEP_FRAMING_BYTES = 1_024;
const AGENT_OUTPUT_CONTEXT_BYTES_PER_TOKEN = 4;
const AGENT_TOOL_RESULT_CONTEXT_BYTES_PER_CHAR = 4;
const USD_PER_AGENT_CREDIT = 0.01;

export type AgentTurnBudget = {
  modelSpec: string;
  servingProvider: string;
  reservedCredits: number;
  maxSteps: number;
  maxOutputTokens: number;
  maxContextTokens: number;
  maxContextBytes: number;
  maxToolResultChars: number;
};

export function agentContextBytesToTokens(bytes: number) {
  return Math.ceil(bytes / AGENT_CONTEXT_BYTES_PER_TOKEN);
}

export function agentContextTokensToBytes(tokens: number) {
  return tokens * AGENT_CONTEXT_BYTES_PER_TOKEN;
}

function stepWorstCaseUsd(entry: AgentModelEntry, contextTokens: number, outputTokens: number) {
  const promptTokens = contextTokens + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS;
  const pricing = resolveModelPricing(entry.modelId, promptTokens, entry.servingProvider);
  const maxInputRate = Math.max(pricing.inputPerMTok, pricing.cacheReadPerMTok, pricing.cacheWritePerMTok);

  return (promptTokens * maxInputRate) / 1_000_000 + (outputTokens * pricing.outputPerMTok) / 1_000_000;
}

export function agentTurnWorstCaseUsd(
  entry: AgentModelEntry,
  budget: Pick<AgentTurnBudget, "maxSteps" | "maxOutputTokens" | "maxContextTokens"> = {
    maxSteps: entry.maxSteps,
    maxOutputTokens: entry.maxOutputTokens,
    maxContextTokens: entry.maxContextTokens,
  },
) {
  return budget.maxSteps * stepWorstCaseUsd(entry, budget.maxContextTokens, budget.maxOutputTokens);
}

export function resolveAgentTurnBudget(args: {
  model: AgentModelEntry;
  availableCredits: number;
  requiredContextBytes?: number;
  minimumSteps?: number;
}): AgentTurnBudget | null {
  const entry = args.model;
  if (!Number.isSafeInteger(args.availableCredits) || args.availableCredits < 1) return null;
  if (!isAgentModelWithinBudgetEnvelope(entry)) return null;

  const requiredContextBytes =
    args.requiredContextBytes ?? agentContextTokensToBytes(AGENT_MIN_CONTEXT_TOKENS_PER_STEP);
  if (!Number.isSafeInteger(requiredContextBytes) || requiredContextBytes < 1) return null;
  const requiredContextTokens = agentContextBytesToTokens(requiredContextBytes);
  if (requiredContextTokens > entry.maxContextTokens) return null;

  const minimumSteps = args.minimumSteps ?? 1;
  if (!Number.isSafeInteger(minimumSteps) || minimumSteps < 1 || minimumSteps > entry.maxSteps) return null;

  const configuredToolResultChars = Math.min(entry.maxToolResultChars, AGENT_MAX_TOOL_RESULT_CHARS);
  const fullTurnCredits = Math.max(1, Math.ceil(agentTurnWorstCaseUsd(entry) / USD_PER_AGENT_CREDIT));
  const reservedCredits = Math.min(args.availableCredits, fullTurnCredits);
  const turnBudgetUsd = reservedCredits * USD_PER_AGENT_CREDIT;
  const pricing = resolveModelPricing(entry.modelId, agentModelWorstCasePromptTokens(entry), entry.servingProvider);
  const maxInputRate = Math.max(pricing.inputPerMTok, pricing.cacheReadPerMTok, pricing.cacheWritePerMTok);

  for (let maxSteps = entry.maxSteps; maxSteps >= minimumSteps; maxSteps -= 1) {
    const stepBudgetUsd = turnBudgetUsd / maxSteps;
    const minimumContextTokens = Math.max(AGENT_MIN_CONTEXT_TOKENS_PER_STEP, requiredContextTokens);
    const minimumInputCost =
      ((minimumContextTokens + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS) * maxInputRate) / 1_000_000;
    const maximumAffordableOutput = Math.floor(
      ((stepBudgetUsd - minimumInputCost) * 1_000_000) / pricing.outputPerMTok,
    );
    const minimumOutputTokens = Math.min(entry.maxOutputTokens, AGENT_MIN_OUTPUT_TOKENS_PER_STEP);

    for (
      let maxOutputTokens = Math.min(entry.maxOutputTokens, maximumAffordableOutput);
      maxOutputTokens >= minimumOutputTokens;
      maxOutputTokens -= 1
    ) {
      const outputCost = (maxOutputTokens * pricing.outputPerMTok) / 1_000_000;
      const maxContextTokens = Math.min(
        entry.maxContextTokens,
        Math.floor(((stepBudgetUsd - outputCost) * 1_000_000) / maxInputRate) - AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
      );
      if (maxContextTokens < minimumContextTokens) continue;

      const maxContextBytes = agentContextTokensToBytes(maxContextTokens);
      let maxToolResultChars = configuredToolResultChars;
      if (maxSteps > 1) {
        const accumulatedSteps = Math.min(maxSteps - 1, AGENT_CONTEXT_ACCUMULATION_STEPS);
        const availableGrowthBytesPerStep = Math.floor((maxContextBytes - requiredContextBytes) / accumulatedSteps);
        const outputAndFramingBytes =
          maxOutputTokens * AGENT_OUTPUT_CONTEXT_BYTES_PER_TOKEN + AGENT_INTERSTEP_FRAMING_BYTES;
        maxToolResultChars = Math.min(
          configuredToolResultChars,
          Math.floor((availableGrowthBytesPerStep - outputAndFramingBytes) / AGENT_TOOL_RESULT_CONTEXT_BYTES_PER_CHAR),
        );
        if (maxToolResultChars < AGENT_MIN_TOOL_RESULT_CHARS) continue;
      }

      const budget = {
        modelSpec: entry.modelId,
        servingProvider: entry.servingProvider,
        reservedCredits,
        maxSteps,
        maxOutputTokens,
        maxContextTokens,
        maxContextBytes,
        maxToolResultChars,
      };
      if (agentTurnWorstCaseUsd(entry, budget) <= turnBudgetUsd) return budget;
    }
  }

  return null;
}

export function serializedAgentContextBytes(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

export function isAgentContextWithinBudget(value: unknown, maxContextBytes: number) {
  if (!Number.isSafeInteger(maxContextBytes) || maxContextBytes < 1) return false;
  const bytes = serializedAgentContextBytes(value);
  return bytes !== null && bytes <= maxContextBytes;
}

export function resolveAgentToolResultMaxChars(configured: number) {
  if (!Number.isFinite(configured) || configured <= 0) return 1;
  return Math.min(Math.floor(configured), AGENT_MAX_TOOL_RESULT_CHARS);
}
