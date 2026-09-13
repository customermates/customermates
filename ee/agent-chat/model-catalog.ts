import { lowestModelPromptTierBoundary, resolveModelPricing, type ModelInferenceRegion } from "./model-pricing";

export const AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS = 2_500;
export const AGENT_CONTEXT_BYTES_PER_TOKEN = 3;
export const AGENT_MIN_BYTES_PER_PROVIDER_TOKEN = 1;

export type AgentModelEntry = {
  modelId: string;
  servingProvider: string;
  inferenceRegion: ModelInferenceRegion | null;
  maxOutputTokens: number;
  maxContextTokens: number;
  maxToolResultChars: number;
};

export const MODEL_CATALOG = {
  fast: {
    modelId: "openai/gpt-5-nano",
    servingProvider: "azure",
    inferenceRegion: null,
    maxOutputTokens: 8192,
    maxContextTokens: 66_000,
    maxToolResultChars: 6000,
  },
  balanced: {
    modelId: "google/gemini-3.5-flash-lite",
    servingProvider: "vertex",
    inferenceRegion: "eu",
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
  const maxSerializedBytes = entry.maxContextTokens * AGENT_CONTEXT_BYTES_PER_TOKEN;
  const serializedTokenCeiling = Math.ceil(maxSerializedBytes / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN);
  return serializedTokenCeiling + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS;
}

export function isAgentModelWithinBudgetEnvelope(entry: AgentModelEntry) {
  const boundary = lowestModelPromptTierBoundary(entry.modelId, entry.servingProvider, entry.inferenceRegion);
  return boundary === null || agentModelWorstCasePromptTokens(entry) < boundary;
}

function assertServable(key: AgentModelKey) {
  const entry = MODEL_CATALOG[key];
  resolveModelPricing(
    entry.modelId,
    agentModelWorstCasePromptTokens(entry),
    entry.servingProvider,
    entry.inferenceRegion,
  );
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
