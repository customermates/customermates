import { z } from "zod";

import {
  AGENT_REASONING_EFFORTS,
  AGENT_THINKING_LEVELS,
  assertServableEntry,
  type AgentModelEntry,
} from "./agent-model";

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

export function benchmarkModelOverlay() {
  benchmarkOverlay ??= loadBenchmarkModelOverlay(typeof process === "undefined" ? {} : process.env);
  return benchmarkOverlay;
}
