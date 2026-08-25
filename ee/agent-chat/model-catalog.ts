import { env } from "@/env";

import { lowestModelPromptTierBoundary, resolveModelPricing } from "./model-pricing";

export const AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS = 2_500;
export const AGENT_CONTEXT_BYTES_PER_TOKEN = 3;

export type AgentModelEntry = {
  modelId: string;
  servingProvider: string;
  maxSteps: number;
  maxOutputTokens: number;
  maxContextTokens: number;
  maxToolResultChars: number;
};

export const MODEL_CATALOG = {
  fast: {
    modelId: "openai/gpt-5-nano",
    servingProvider: "openai",
    maxSteps: 20,
    maxOutputTokens: 8192,
    maxContextTokens: 66_000,
    maxToolResultChars: 6000,
  },
  balanced: {
    modelId: "openai/gpt-5.6-luna",
    servingProvider: "openai",
    maxSteps: 20,
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

function configuredKeys(name: string, value: string | undefined): AgentModelKey[] | null {
  const raw = value?.trim();
  if (!raw) return null;

  const keys = raw
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  for (const key of keys) if (!isAgentModelKey(key)) throw new Error(`${name} names an unknown agent model "${key}".`);
  if (keys.length === 0) throw new Error(`${name} is set but names no agent model.`);

  return [...new Set(keys as AgentModelKey[])];
}

export function agentModelKeys(): AgentModelKey[] {
  return configuredKeys("AGENT_MODEL_KEYS", env.AGENT_MODEL_KEYS) ?? CATALOG_KEYS;
}

export function defaultAgentModelKey(): AgentModelKey {
  const enabled = agentModelKeys();
  const configured = configuredKeys("AGENT_MODEL_DEFAULT", env.AGENT_MODEL_DEFAULT);
  if (!configured) return enabled.includes(SHIPPED_AGENT_MODEL_KEY) ? SHIPPED_AGENT_MODEL_KEY : enabled[0];

  const [preferred] = configured;
  if (!enabled.includes(preferred))
    throw new Error(`AGENT_MODEL_DEFAULT names "${preferred}", which AGENT_MODEL_KEYS does not enable.`);

  return preferred;
}

export function isEnabledAgentModelKey(value: string): value is AgentModelKey {
  return isAgentModelKey(value) && agentModelKeys().includes(value);
}

export function resolveAgentModel(key?: string | null): AgentModelEntry {
  if (key == null) return MODEL_CATALOG[defaultAgentModelKey()];
  if (!isAgentModelKey(key)) throw new Error(`Unknown agent model "${key}".`);
  if (!agentModelKeys().includes(key)) throw new Error(`Agent model "${key}" is not enabled in this environment.`);

  return MODEL_CATALOG[key];
}
