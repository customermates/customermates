import type { AgentModelEntry } from "./model-catalog";

import {
  AGENT_CONTEXT_BYTES_PER_TOKEN,
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
  isAgentModelWithinBudgetEnvelope,
} from "./model-catalog";
import { resolveModelPricing } from "./model-pricing";
import { AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS } from "./agent-web-search";
import { AGENT_SYSTEM_PROMPT_SEPARATOR } from "./agent-wiki-context";
import { AGENT_MICROCENTS_PER_USD } from "@/core/commercial/agent-credits";

export const AGENT_RESERVATION_ROUNDS_AHEAD = 2;
export const AGENT_MAX_TOOL_RESULT_CHARS = 6000;
export const AGENT_MIN_CONTEXT_TOKENS_PER_STEP = 8_000;
export const AGENT_MAX_SERIALIZED_BYTES_PER_CHAR = 6;
export const AGENT_TOOL_RESULT_ENVELOPE_BYTES = 4_096;

export type AgentMeasuredContext = { contextBytes: number; promptTokens: number };

export type AgentTurnBudget = {
  modelSpec: string;
  servingProvider: string;
  inferenceRegion: AgentModelEntry["inferenceRegion"];
  reservedMicrocents: number;
  roundReserveMicrocents: number;
  maxOutputTokens: number;
  maxContextTokens: number;
  maxContextBytes: number;
  maxToolResultChars: number;
  reasoningEffort?: AgentModelEntry["reasoningEffort"];
};

export function agentContextBytesToTokens(bytes: number) {
  return Math.ceil(bytes / AGENT_CONTEXT_BYTES_PER_TOKEN);
}

export function agentContextTokensToBytes(tokens: number) {
  return tokens * AGENT_CONTEXT_BYTES_PER_TOKEN;
}

export function agentContextBytesToWorstCaseProviderTokens(bytes: number) {
  return Math.ceil(bytes / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN);
}

const MICROCENTS_PER_USD_PER_MILLION_TOKENS = AGENT_MICROCENTS_PER_USD / 1_000_000;

function stepWorstCaseMicrocents(
  entry: Pick<AgentModelEntry, "modelId" | "servingProvider" | "inferenceRegion">,
  promptTokens: number,
  outputTokens: number,
) {
  const pricing = resolveModelPricing(entry.modelId, promptTokens, entry.servingProvider, entry.inferenceRegion);
  const maxInputRate = Math.max(
    pricing.inputPerMTok,
    pricing.cacheReadPerMTok,
    pricing.cacheWritePerMTok,
    pricing.cacheWrite1hPerMTok,
  );
  const microcents =
    (promptTokens * maxInputRate + outputTokens * pricing.outputPerMTok) * MICROCENTS_PER_USD_PER_MILLION_TOKENS;

  return Math.ceil(Math.round(microcents * 1_000_000) / 1_000_000);
}

function worstCasePromptTokens(contextBytes: number) {
  return agentContextBytesToWorstCaseProviderTokens(contextBytes) + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS;
}

function roundPromptTokens(contextBytes: number, measured: AgentMeasuredContext | null) {
  const worstCase = worstCasePromptTokens(contextBytes);
  if (
    !measured ||
    !Number.isSafeInteger(measured.promptTokens) ||
    measured.promptTokens < 1 ||
    !Number.isSafeInteger(measured.contextBytes) ||
    contextBytes < measured.contextBytes
  )
    return worstCase;
  return Math.min(
    worstCase,
    measured.promptTokens + agentContextBytesToWorstCaseProviderTokens(contextBytes - measured.contextBytes),
  );
}

export function agentRoundWorstCaseMicrocentsForContextBytes(entry: AgentModelEntry, contextBytes: number) {
  return stepWorstCaseMicrocents(entry, worstCasePromptTokens(contextBytes), entry.maxOutputTokens);
}

export function agentRoundWorstCaseMicrocents(entry: AgentModelEntry) {
  return agentRoundWorstCaseMicrocentsForContextBytes(entry, agentContextTokensToBytes(entry.maxContextTokens));
}

export function agentRoundReserveMicrocents(
  budget: AgentTurnBudget,
  contextBytes: number,
  measured: AgentMeasuredContext | null = null,
) {
  const bytes =
    Number.isSafeInteger(contextBytes) && contextBytes > 0
      ? Math.min(contextBytes, budget.maxContextBytes)
      : budget.maxContextBytes;
  return Math.min(
    budget.roundReserveMicrocents,
    stepWorstCaseMicrocents(
      { modelId: budget.modelSpec, servingProvider: budget.servingProvider, inferenceRegion: budget.inferenceRegion },
      roundPromptTokens(bytes, measured),
      budget.maxOutputTokens,
    ),
  );
}

export function agentPendingToolResultBytes(maxToolResultChars: number) {
  return (
    resolveAgentToolResultMaxChars(maxToolResultChars) * AGENT_MAX_SERIALIZED_BYTES_PER_CHAR +
    AGENT_TOOL_RESULT_ENVELOPE_BYTES
  );
}

export function agentNextRoundContextBytes(args: {
  contextBytes: number;
  appended: unknown;
  pendingToolResults: number;
  maxToolResultChars: number;
  maxContextBytes: number;
}) {
  const appendedBytes = serializedAgentContextBytes(args.appended);
  if (appendedBytes === null || !Number.isSafeInteger(args.contextBytes)) return args.maxContextBytes;
  return Math.min(
    args.maxContextBytes,
    args.contextBytes +
      appendedBytes +
      Math.max(0, args.pendingToolResults) * agentPendingToolResultBytes(args.maxToolResultChars),
  );
}

export function agentFundedRetryCount(args: {
  remainingMicrocents: number;
  roundReserveMicrocents: number;
  maxRetries: number;
}): number {
  if (
    !Number.isSafeInteger(args.remainingMicrocents) ||
    args.remainingMicrocents < 0 ||
    !Number.isSafeInteger(args.roundReserveMicrocents) ||
    args.roundReserveMicrocents < 1 ||
    !Number.isSafeInteger(args.maxRetries) ||
    args.maxRetries < 0
  )
    return 0;
  return Math.min(args.maxRetries, Math.max(0, Math.floor(args.remainingMicrocents / args.roundReserveMicrocents) - 1));
}

export function agentWebSearchReserveMicrocents(remainingSearches: number): number {
  if (!Number.isSafeInteger(remainingSearches) || remainingSearches < 1) return 0;
  return remainingSearches * AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS;
}

export function resolveAgentTurnBudget(args: {
  model: AgentModelEntry;
  availableMicrocents: number;
  requiredContextBytes?: number;
  webSearchReserveMicrocents?: number;
}): AgentTurnBudget | null {
  const entry = args.model;
  if (!Number.isSafeInteger(args.availableMicrocents) || args.availableMicrocents < 1) return null;
  if (!isAgentModelWithinBudgetEnvelope(entry)) return null;

  const requiredContextBytes =
    args.requiredContextBytes ?? agentContextTokensToBytes(AGENT_MIN_CONTEXT_TOKENS_PER_STEP);
  if (!Number.isSafeInteger(requiredContextBytes) || requiredContextBytes < 1) return null;
  if (agentContextBytesToTokens(requiredContextBytes) > entry.maxContextTokens) return null;

  const roundReserveMicrocents = agentRoundWorstCaseMicrocents(entry);
  const firstRoundReserveMicrocents =
    args.requiredContextBytes === undefined
      ? roundReserveMicrocents
      : Math.min(roundReserveMicrocents, agentRoundWorstCaseMicrocentsForContextBytes(entry, requiredContextBytes));
  if (!Number.isSafeInteger(firstRoundReserveMicrocents) || firstRoundReserveMicrocents < 1) return null;
  if (args.availableMicrocents < firstRoundReserveMicrocents) return null;

  return {
    modelSpec: entry.modelId,
    servingProvider: entry.servingProvider,
    inferenceRegion: entry.inferenceRegion,
    reservedMicrocents: Math.min(
      args.availableMicrocents,
      Math.max(
        firstRoundReserveMicrocents * AGENT_RESERVATION_ROUNDS_AHEAD,
        firstRoundReserveMicrocents + (args.webSearchReserveMicrocents ?? 0),
      ),
    ),
    roundReserveMicrocents,
    maxOutputTokens: entry.maxOutputTokens,
    maxContextTokens: entry.maxContextTokens,
    maxContextBytes: agentContextTokensToBytes(entry.maxContextTokens),
    maxToolResultChars: Math.min(entry.maxToolResultChars, AGENT_MAX_TOOL_RESULT_CHARS),
    ...(entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}),
  };
}

export function serializedAgentContextBytes(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function withoutSystem<T extends { system: string }>({ system: _system, ...sent }: T) {
  return sent;
}

function leadingSystemText(messages: readonly unknown[]): string | null {
  const contents: string[] = [];
  for (const message of messages as readonly ({ role?: unknown; content?: unknown } | null)[]) {
    if (message?.role !== "system") break;
    if (typeof message.content !== "string") return null;
    contents.push(message.content);
  }
  return contents.length ? contents.join(AGENT_SYSTEM_PROMPT_SEPARATOR) : null;
}

export function agentStepContext<T extends { system: string; messages: readonly unknown[] }>(context: T) {
  return leadingSystemText(context.messages) === context.system ? withoutSystem(context) : context;
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

export const AGENT_TOOL_RESULT_TRUNCATED_MARK = "[truncated:";

function truncationNotice(kept: number, total: number) {
  return `\n${AGENT_TOOL_RESULT_TRUNCATED_MARK} first ${kept} of ${total} characters. The rest was not read, so this page is incomplete: re-run it with a smaller pageSize, about half, fewer ids, or a narrower filter before answering. Report partial data only once a smaller request has also been truncated, and say so.]`;
}

export function agentToolResultText(result: string, maxChars: number) {
  if (result.length <= maxChars) return result;
  const budget = maxChars - truncationNotice(maxChars, result.length).length;
  if (budget < 1) return result.slice(0, maxChars);
  const lineEnd = result.lastIndexOf("\n", budget);
  const kept = lineEnd >= budget / 2 ? lineEnd : budget;
  return `${result.slice(0, kept)}${truncationNotice(kept, result.length)}`;
}
