import { lowestModelPromptTierBoundary, resolveModelPricing, type ModelInferenceRegion } from "./model-pricing";

export const AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS = 2_500;
export const AGENT_CONTEXT_BYTES_PER_TOKEN = 3;
export const AGENT_MIN_BYTES_PER_PROVIDER_TOKEN = 2;

export const AGENT_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
export const AGENT_THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;

export type AgentReasoningEffort = (typeof AGENT_REASONING_EFFORTS)[number];
export type AgentThinkingLevel = (typeof AGENT_THINKING_LEVELS)[number];

export type AgentModelEntry = {
  modelId: string;
  servingProvider: string;
  inferenceRegion: ModelInferenceRegion | null;
  maxOutputTokens: number;
  maxContextTokens: number;
  maxToolResultChars: number;
  reasoningEffort?: AgentReasoningEffort;
  thinkingLevel?: AgentThinkingLevel;
};

export function agentModelWorstCasePromptTokens(entry: AgentModelEntry) {
  const maxSerializedBytes = entry.maxContextTokens * AGENT_CONTEXT_BYTES_PER_TOKEN;
  const serializedTokenCeiling = Math.ceil(maxSerializedBytes / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN);
  return serializedTokenCeiling + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS;
}

export function isAgentModelWithinBudgetEnvelope(entry: AgentModelEntry) {
  const boundary = lowestModelPromptTierBoundary(entry.modelId, entry.servingProvider, entry.inferenceRegion);
  return boundary === null || agentModelWorstCasePromptTokens(entry) < boundary;
}

export function assertServableEntry(label: string, entry: AgentModelEntry) {
  resolveModelPricing(
    entry.modelId,
    agentModelWorstCasePromptTokens(entry),
    entry.servingProvider,
    entry.inferenceRegion,
  );
  if (!isAgentModelWithinBudgetEnvelope(entry)) {
    throw new Error(
      `Agent model "${label}" reserves ${agentModelWorstCasePromptTokens(entry)} prompt tokens, which crosses a pricing tier boundary of "${entry.modelId}". Lower its context envelope or price every tier it can reach.`,
    );
  }
}
