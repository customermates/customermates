import { lowestModelPromptTierBoundary, resolveModelPricing } from "./model-pricing";

export const AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS = 2_500;
export const AGENT_CONTEXT_BYTES_PER_TOKEN = 3;

export type AgentModelEntry = {
  modelId: string;
  servingProvider: string;
  maxOutputTokens: number;
  maxContextTokens: number;
  maxToolResultChars: number;
};

export const MODEL_CATALOG = {
  fast: {
    modelId: "openai/gpt-5-nano",
    servingProvider: "azure",
    maxOutputTokens: 8192,
    maxContextTokens: 66_000,
    maxToolResultChars: 6000,
  },
  balanced: {
    modelId: "openai/gpt-5.6-luna",
    servingProvider: "azure",
    maxOutputTokens: 2048,
    maxContextTokens: 66_000,
    maxToolResultChars: 6000,
  },
} as const satisfies Record<string, AgentModelEntry>;

export type AgentModelKey = keyof typeof MODEL_CATALOG;

export const SHIPPED_AGENT_MODEL_KEY: AgentModelKey = "balanced";

const CATALOG_KEYS = Object.keys(MODEL_CATALOG) as AgentModelKey[];

export function isAgentModelKey(value: string): value is AgentModelKey {
  return (CATALOG_KEYS as readonly string[]).includes(value);
}

export function agentModelWorstCasePromptTokens(entry: AgentModelEntry) {
  return entry.maxContextTokens + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS;
}

export function isAgentModelWithinBudgetEnvelope(entry: AgentModelEntry) {
  const boundary = lowestModelPromptTierBoundary(entry.modelId, entry.servingProvider);
  return boundary === null || agentModelWorstCasePromptTokens(entry) < boundary;
}

function assertServable(key: AgentModelKey) {
  const entry = MODEL_CATALOG[key];
  resolveModelPricing(entry.modelId, agentModelWorstCasePromptTokens(entry), entry.servingProvider);
  if (!isAgentModelWithinBudgetEnvelope(entry)) {
    throw new Error(
      `Agent model "${key}" reserves ${agentModelWorstCasePromptTokens(entry)} prompt tokens, which crosses a pricing tier boundary of "${entry.modelId}". Lower its context envelope or price every tier it can reach.`,
    );
  }
}

for (const key of CATALOG_KEYS) assertServable(key);

export function resolveAgentModel(key?: string | null): AgentModelEntry {
  if (key == null) return MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY];
  if (!isAgentModelKey(key)) throw new Error(`Unknown agent model "${key}".`);

  return MODEL_CATALOG[key];
}
