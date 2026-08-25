import type { JSONValue } from "@ai-sdk/provider";

import { env } from "@/env";

import { lowestModelPromptTierBoundary, resolveModelPricing } from "./model-pricing";

export const AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS = 2_500;
export const AGENT_CONTEXT_BYTES_PER_TOKEN = 3;

export type AgentModelProviderOptions = Record<string, Record<string, JSONValue>>;

export type AgentModelSpeed = {
  key: string;
  maxOutputTokens: number;
  providerOptions: AgentModelProviderOptions;
};

export type AgentModelEntry = {
  modelId: string;
  servingProvider: string;
  maxSteps: number;
  maxOutputTokens: number;
  maxContextTokens: number;
  maxToolResultChars: number;
  speeds?: readonly AgentModelSpeed[];
};

export const MODEL_CATALOG = {
  fast: {
    modelId: "openai/gpt-5-nano",
    servingProvider: "openai",
    maxSteps: 20,
    maxOutputTokens: 8192,
    maxContextTokens: 66_000,
    maxToolResultChars: 6000,
    speeds: [
      { key: "low", maxOutputTokens: 4096, providerOptions: { openai: { reasoningEffort: "minimal" } } },
      { key: "standard", maxOutputTokens: 8192, providerOptions: {} },
      { key: "high", maxOutputTokens: 16_384, providerOptions: { openai: { reasoningEffort: "high" } } },
    ],
  },
  balanced: {
    modelId: "openai/gpt-5.6-luna",
    servingProvider: "openai",
    maxSteps: 20,
    maxOutputTokens: 2048,
    maxContextTokens: 66_000,
    maxToolResultChars: 6000,
    speeds: [
      { key: "low", maxOutputTokens: 2048, providerOptions: { openai: { reasoningEffort: "none" } } },
      { key: "standard", maxOutputTokens: 2048, providerOptions: {} },
      { key: "high", maxOutputTokens: 16_384, providerOptions: { openai: { reasoningEffort: "high" } } },
    ],
  },
  expert: {
    modelId: "anthropic/claude-opus-5",
    servingProvider: "anthropic",
    maxSteps: 20,
    maxOutputTokens: 4096,
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

export const AGENT_SPEED_KEYS = ["low", "standard", "high"] as const;

export type AgentSpeedKey = (typeof AGENT_SPEED_KEYS)[number];

export const DEFAULT_AGENT_SPEED_KEY: AgentSpeedKey = "standard";

export function agentModelSpeedKeys(entry: AgentModelEntry): AgentSpeedKey[] {
  return (entry.speeds ?? []).map((speed) => speed.key as AgentSpeedKey);
}

export function resolveAgentModelSpeed(entry: AgentModelEntry, key?: string | null): AgentModelSpeed | null {
  const speeds = entry.speeds ?? [];
  if (speeds.length === 0) return null;

  return (
    speeds.find((speed) => speed.key === key) ??
    speeds.find((speed) => speed.key === DEFAULT_AGENT_SPEED_KEY) ??
    speeds[0]
  );
}

export function applyAgentModelSpeed(entry: AgentModelEntry, speed: AgentModelSpeed | null): AgentModelEntry {
  if (!speed) return entry;

  return { ...entry, maxOutputTokens: speed.maxOutputTokens };
}

export function agentModelKeyOfSpec(modelSpec: string): AgentModelKey | null {
  return CATALOG_KEYS.find((key) => MODEL_CATALOG[key].modelId === modelSpec) ?? null;
}

export type AgentModelOption = {
  key: AgentModelKey;
  costBand: number;
  isDefault: boolean;
  speeds: AgentSpeedKey[];
  defaultSpeed: AgentSpeedKey | null;
};

export function agentModelOptions(costOf: (entry: AgentModelEntry) => number): AgentModelOption[] {
  const keys = agentModelKeys();
  const costs = keys.map((key) => costOf(MODEL_CATALOG[key]));
  const cheapest = Math.min(...costs);
  const fallback = defaultAgentModelKey();

  return keys.map((key, index) => ({
    key,
    costBand: Math.max(1, Math.round(costs[index] / cheapest)),
    isDefault: key === fallback,
    speeds: agentModelSpeedKeys(MODEL_CATALOG[key]),
    defaultSpeed: (resolveAgentModelSpeed(MODEL_CATALOG[key], DEFAULT_AGENT_SPEED_KEY)?.key as AgentSpeedKey) ?? null,
  }));
}
