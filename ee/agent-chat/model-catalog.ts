import { z } from "zod";

import { lowestModelPromptTierBoundary, resolveModelPricing, type ModelInferenceRegion } from "./model-pricing";

export const AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS = 2_500;
export const AGENT_CONTEXT_BYTES_PER_TOKEN = 3;
export const AGENT_MIN_BYTES_PER_PROVIDER_TOKEN = 1;

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

export const BENCHMARK_MODEL_KEY_PREFIX = "bench:";

const BenchmarkModelEntrySchema = z.object({
  key: z.string().regex(/^bench:[a-z0-9][a-z0-9-]{0,59}$/),
  modelId: z.string().min(1),
  servingProvider: z.string().min(1),
  inferenceRegion: z.enum(["eu", "us"]).nullable(),
  maxOutputTokens: z.number().int().positive(),
  maxContextTokens: z.number().int().positive(),
  maxToolResultChars: z.number().int().positive(),
  reasoningEffort: z.enum(AGENT_REASONING_EFFORTS).optional(),
  thinkingLevel: z.enum(AGENT_THINKING_LEVELS).optional(),
});

export type BenchmarkModelEntry = z.infer<typeof BenchmarkModelEntrySchema>;

function isCatalogKey(value: string): value is AgentModelKey {
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

function assertServableEntry(label: string, entry: AgentModelEntry) {
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

for (const key of CATALOG_KEYS) assertServableEntry(key, MODEL_CATALOG[key]);

export function loadBenchmarkModelOverlay(
  environment: Record<string, string | undefined>,
): Record<string, AgentModelEntry> {
  if (environment.LOCAL_AGENT_BENCHMARK !== "true") return {};
  for (const forbidden of ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_DEPLOYMENT_ID"]) {
    if (environment[forbidden] !== undefined)
      throw new Error("The benchmark model overlay is forbidden in a deployment environment.");
  }

  const raw = environment.AGENT_BENCHMARK_ARMS;
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_BENCHMARK_ARMS must be a JSON array of benchmark model entries.");
  }
  const entries = z.array(BenchmarkModelEntrySchema).min(1).parse(parsed);
  const overlay: Record<string, AgentModelEntry> = {};
  for (const { key, ...entry } of entries) {
    if (overlay[key]) throw new Error(`Duplicate benchmark model key "${key}".`);
    assertServableEntry(key, entry);
    overlay[key] = entry;
  }
  return overlay;
}

let benchmarkOverlay: Record<string, AgentModelEntry> | undefined;

function benchmarkModelOverlay() {
  benchmarkOverlay ??= loadBenchmarkModelOverlay(typeof process === "undefined" ? {} : process.env);
  return benchmarkOverlay;
}

export function isAgentModelKey(value: string): boolean {
  return isCatalogKey(value) || Object.hasOwn(benchmarkModelOverlay(), value);
}

export function resolveAgentModel(key?: string | null): AgentModelEntry {
  if (key == null) return MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY];
  if (isCatalogKey(key)) return MODEL_CATALOG[key];
  const overlay = benchmarkModelOverlay()[key];
  if (overlay) return overlay;
  throw new Error(`Unknown agent model "${key}".`);
}
