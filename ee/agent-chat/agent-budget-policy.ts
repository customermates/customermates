import type { AgentModelEntry } from "./model-catalog";

import {
  AGENT_CONTEXT_BYTES_PER_TOKEN,
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
  isAgentModelWithinBudgetEnvelope,
} from "./model-catalog";
import { resolveModelPricing } from "./model-pricing";

export const AGENT_RESERVATION_ROUNDS_AHEAD = 4;
export const AGENT_MAX_TOOL_RESULT_CHARS = 6000;
export const AGENT_MIN_CONTEXT_TOKENS_PER_STEP = 8_000;

const USD_PER_AGENT_CREDIT = 0.01;

export type AgentTurnBudget = {
  modelSpec: string;
  servingProvider: string;
  reservedCredits: number;
  roundReserveCredits: number;
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

export function agentRoundWorstCaseCredits(entry: AgentModelEntry) {
  const roundUsd = stepWorstCaseUsd(entry, entry.maxContextTokens, entry.maxOutputTokens);
  return Math.max(1, Math.ceil(roundUsd / USD_PER_AGENT_CREDIT));
}

export function resolveAgentTurnBudget(args: {
  model: AgentModelEntry;
  availableCredits: number;
  requiredContextBytes?: number;
}): AgentTurnBudget | null {
  const entry = args.model;
  if (!Number.isSafeInteger(args.availableCredits) || args.availableCredits < 1) return null;
  if (!isAgentModelWithinBudgetEnvelope(entry)) return null;

  const requiredContextBytes =
    args.requiredContextBytes ?? agentContextTokensToBytes(AGENT_MIN_CONTEXT_TOKENS_PER_STEP);
  if (!Number.isSafeInteger(requiredContextBytes) || requiredContextBytes < 1) return null;
  if (agentContextBytesToTokens(requiredContextBytes) > entry.maxContextTokens) return null;

  const roundReserveCredits = agentRoundWorstCaseCredits(entry);

  return {
    modelSpec: entry.modelId,
    servingProvider: entry.servingProvider,
    reservedCredits: Math.min(args.availableCredits, roundReserveCredits * AGENT_RESERVATION_ROUNDS_AHEAD),
    roundReserveCredits,
    maxOutputTokens: entry.maxOutputTokens,
    maxContextTokens: entry.maxContextTokens,
    maxContextBytes: agentContextTokensToBytes(entry.maxContextTokens),
    maxToolResultChars: Math.min(entry.maxToolResultChars, AGENT_MAX_TOOL_RESULT_CHARS),
  };
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
