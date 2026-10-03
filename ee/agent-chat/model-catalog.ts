import type { AgentModelEntry } from "./agent-model";

import { assertServableEntry } from "./agent-model";
import { benchmarkModelOverlay } from "./benchmark-model-registry";

export {
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
  AGENT_CONTEXT_BYTES_PER_TOKEN,
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  agentModelWorstCasePromptTokens,
  isAgentModelWithinBudgetEnvelope,
} from "./agent-model";
export type { AgentModelEntry, AgentReasoningEffort, AgentThinkingLevel } from "./agent-model";

export const SHIPPED_AGENT_MODEL_KEY = "balanced";
export type AgentModelKey = typeof SHIPPED_AGENT_MODEL_KEY;

export const SHIPPED_AGENT_MODEL = {
  modelId: "google/gemini-3.5-flash-lite",
  servingProvider: "vertex",
  inferenceRegion: "eu",
  maxOutputTokens: 8192,
  maxContextTokens: 66_000,
  maxToolResultChars: 6000,
  thinkingLevel: "low",
} as const satisfies AgentModelEntry;

assertServableEntry(SHIPPED_AGENT_MODEL_KEY, SHIPPED_AGENT_MODEL);

export const INITIAL_WIKI_SYNTHESIS_MODEL = {
  ...SHIPPED_AGENT_MODEL,
  modelId: "google/gemini-3.8-flash",
  maxOutputTokens: 16_384,
  thinkingLevel: "low",
} as const satisfies AgentModelEntry;

assertServableEntry("initial Knowledge Base synthesis", INITIAL_WIKI_SYNTHESIS_MODEL);

export function isAgentModelKey(value: string): boolean {
  return value === SHIPPED_AGENT_MODEL_KEY || Object.hasOwn(benchmarkModelOverlay(), value);
}

export function resolveAgentModel(
  key?: string | null,
  purpose: "chat" | "initial_wiki_synthesis" = "chat",
): AgentModelEntry {
  if (key == null || key === SHIPPED_AGENT_MODEL_KEY)
    return purpose === "initial_wiki_synthesis" ? INITIAL_WIKI_SYNTHESIS_MODEL : SHIPPED_AGENT_MODEL;
  const overlay = benchmarkModelOverlay()[key];
  if (overlay) return overlay;
  throw new Error(`Unknown agent model "${key}".`);
}
