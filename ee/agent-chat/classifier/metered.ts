import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { ClassifyOptions } from "./index";
import type { DocsEmbeddingModelKey } from "@/core/config/environment";

import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "@/env";

import { computeCostMicrocents, type TokenCounts } from "../model-pricing";

import { estimateEmbeddingCostMicrocents, runEmbedding } from "./embedding-runner";
import { classifyAttempt } from "./index";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "./jev-runner";

export const CLASSIFIER_USES = ["docs_rerank", "docs_embedding", "docs_search"] as const;

export type ClassifierUse = (typeof CLASSIFIER_USES)[number];

export type MeteredClassifierModel = "jev" | DocsEmbeddingModelKey;

export type ClassifierCharge = {
  use: ClassifierUse;
  model: MeteredClassifierModel;
  costMicrocents: number;
  measured: boolean;
  answered: boolean;
  latencyMs?: number;
  hybrid?: boolean;
};

const ESTIMATE_BYTES_PER_TOKEN = 3;

const collector = new AsyncLocalStorage<ClassifierCharge[]>();

export async function collectClassifierCharges<T>(
  run: () => Promise<T>,
): Promise<{ value: T; charges: ClassifierCharge[] }> {
  const charges: ClassifierCharge[] = [];
  const value = await collector.run(charges, run);
  return { value, charges };
}

export function hostedDocsRerankModel(): "jev" | null {
  if (env.AGENT_DOCS_RERANK === "off" || env.APP_MODE === "self-hosted") return null;
  return "jev";
}

export function hostedDocsEmbeddingModel(): DocsEmbeddingModelKey | null {
  if (env.AGENT_DOCS_CANDIDATES !== "hybrid" || hostedDocsRerankModel() === null) return null;
  return env.AGENT_DOCS_EMBEDDING_MODEL;
}

function estimatedTokens(text: string) {
  return Math.ceil(Buffer.byteLength(text, "utf8") / ESTIMATE_BYTES_PER_TOKEN);
}

export function estimateClassifierCostMicrocents(spec: ClassifierSpec, state: ClassifierState): number {
  const tokens: TokenCounts = {
    inputTokens: estimatedTokens(JSON.stringify(jevRequestBody(spec, state))),
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  return computeCostMicrocents(JEV_MODEL_ID, tokens, JEV_PRICING_PROVIDER, null);
}

export async function classifyMetered(
  use: ClassifierUse,
  spec: ClassifierSpec,
  state: ClassifierState,
  model: "jev",
  options: ClassifyOptions = {},
): Promise<{ result: ClassifierResult | null; charge: ClassifierCharge | null }> {
  const attempt = await classifyAttempt(spec, state, model, options);
  if (!attempt.requested) return { result: null, charge: null };
  const measured = attempt.result?.costMicrocents ?? null;
  const charge: ClassifierCharge = {
    use,
    model,
    costMicrocents: measured ?? estimateClassifierCostMicrocents(spec, state),
    measured: measured !== null,
    answered: attempt.result !== null,
  };
  collector.getStore()?.push(charge);
  return { result: attempt.result, charge };
}

export async function embedQueryMetered(
  model: DocsEmbeddingModelKey,
  text: string,
  timeoutMs: number,
): Promise<{ embedding: number[] | null; charge: ClassifierCharge | null }> {
  if (!env.AI_GATEWAY_API_KEY?.trim()) return { embedding: null, charge: null };
  let embedding: number[] | null = null;
  let measured: number | null = null;
  try {
    const run = await runEmbedding(model, [text], { timeoutMs });
    embedding = run.embeddings[0] ?? null;
    measured = run.costMicrocents;
  } catch {
    embedding = null;
  }
  const charge: ClassifierCharge = {
    use: "docs_embedding",
    model,
    costMicrocents: measured ?? estimateEmbeddingCostMicrocents(model, [text]),
    measured: measured !== null,
    answered: embedding !== null,
  };
  collector.getStore()?.push(charge);
  return { embedding, charge };
}

export function recordDocsSearch(latencyMs: number, hybrid: boolean) {
  collector.getStore()?.push({
    use: "docs_search",
    model: "jev",
    costMicrocents: 0,
    measured: true,
    answered: true,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    hybrid,
  });
}
