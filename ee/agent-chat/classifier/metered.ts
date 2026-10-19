import type { ClassifierModel, ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { ClassifierFailure } from "./jev-runner";
import type { ClassifyOptions } from "./index";

import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "@/env";

import { computeCostMicrocents, type TokenCounts } from "../model-pricing";

import { classifyAttempt } from "./index";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "./jev-runner";

type ClassifierUse = "docs_rerank" | "wiki_rerank" | "wiki_synthesis_review";

export type ClassifierCharge = {
  use: ClassifierUse;
  model: ClassifierModel;
  costMicrocents: number;
  measured: boolean;
  answered: boolean;
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

export function hostedDocsRerankModel(): ClassifierModel | null {
  return env.APP_MODE === "self-hosted" ? null : "jev";
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
  model: ClassifierModel,
  options: ClassifyOptions = {},
): Promise<{ result: ClassifierResult | null; charge: ClassifierCharge | null; failure?: ClassifierFailure }> {
  const attempt = await classifyAttempt(spec, state, options);
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
  return { result: attempt.result, charge, ...(attempt.failure ? { failure: attempt.failure } : {}) };
}
