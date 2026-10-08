import type { AgentModelEntry } from "./agent-model";

import { assertServableEntry } from "./agent-model";

export {
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
  AGENT_CONTEXT_BYTES_PER_TOKEN,
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  agentModelWorstCasePromptTokens,
  isAgentModelWithinBudgetEnvelope,
} from "./agent-model";
export type { AgentModelEntry, AgentReasoningEffort } from "./agent-model";

export const SHIPPED_AGENT_MODEL_KEY = "balanced";
export type AgentModelKey = typeof SHIPPED_AGENT_MODEL_KEY;

const HAIKU = {
  modelId: "anthropic/claude-haiku-5.5",
  servingProvider: "vertexAnthropic",
  inferenceRegion: "eu",
  maxOutputTokens: 8192,
  maxContextTokens: 65_000,
  maxToolResultChars: 6000,
} as const satisfies Omit<AgentModelEntry, "reasoningEffort">;

export const AGENT_MODELS = {
  chat: { ...HAIKU, reasoningEffort: "low" },
  routine: { ...HAIKU, reasoningEffort: "medium" },
  wikiSynthesis: { ...HAIKU, maxOutputTokens: 16_384, reasoningEffort: "medium" },
} as const satisfies Record<string, AgentModelEntry>;

export type AgentModelPurpose = keyof typeof AGENT_MODELS;
export type AgentTurnModelPurpose = Extract<AgentModelPurpose, "chat" | "routine">;

for (const [purpose, entry] of Object.entries(AGENT_MODELS)) assertServableEntry(purpose, entry);

export function isAgentModelKey(value: string): boolean {
  return value === SHIPPED_AGENT_MODEL_KEY;
}

export function resolveAgentModel(key?: string | null, purpose: AgentTurnModelPurpose = "chat"): AgentModelEntry {
  if (key == null || key === SHIPPED_AGENT_MODEL_KEY) return AGENT_MODELS[purpose];
  throw new Error(`Unknown agent model "${key}".`);
}
