import type { ClassifierSwitch } from "@/core/config/environment";
import type { ClassifierModel, ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { ClassifyOptions } from "./index";

import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "@/env";

import { computeCostMicrocents, type TokenCounts } from "../model-pricing";

import { GEMINI_CLASSIFIER_ENTRY, GEMINI_CLASSIFIER_MAX_OUTPUT_TOKENS, geminiSystemPrompt } from "./gemini-runner";
import { classifyAttempt } from "./index";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "./jev-runner";

export const CLASSIFIER_USES = ["docs_rerank", "toolset_preload"] as const;

export type ClassifierUse = (typeof CLASSIFIER_USES)[number];

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

export function hostedClassifierModel(setting: ClassifierSwitch): ClassifierModel | null {
  if (setting === "off" || env.APP_MODE === "self-hosted") return null;
  return setting;
}

export function hostedClassifierModelFor(use: ClassifierUse): ClassifierModel | null {
  return hostedClassifierModel(use === "docs_rerank" ? env.AGENT_DOCS_RERANK : env.AGENT_TOOLSET_CLASSIFIER);
}

function estimatedTokens(text: string) {
  return Math.ceil(Buffer.byteLength(text, "utf8") / ESTIMATE_BYTES_PER_TOKEN);
}

export function estimateClassifierCostMicrocents(
  model: ClassifierModel,
  spec: ClassifierSpec,
  state: ClassifierState,
): number {
  if (model === "jev") {
    const tokens: TokenCounts = {
      inputTokens: estimatedTokens(JSON.stringify(jevRequestBody(spec, state))),
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    return computeCostMicrocents(JEV_MODEL_ID, tokens, JEV_PRICING_PROVIDER, null);
  }
  const tokens: TokenCounts = {
    inputTokens: estimatedTokens(`${geminiSystemPrompt(spec)}${JSON.stringify(state)}`),
    outputTokens: GEMINI_CLASSIFIER_MAX_OUTPUT_TOKENS,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  return computeCostMicrocents(
    GEMINI_CLASSIFIER_ENTRY.modelId,
    tokens,
    GEMINI_CLASSIFIER_ENTRY.servingProvider,
    GEMINI_CLASSIFIER_ENTRY.inferenceRegion,
  );
}

export async function classifyMetered(
  use: ClassifierUse,
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  options: ClassifyOptions = {},
): Promise<{ result: ClassifierResult | null; charge: ClassifierCharge | null }> {
  const attempt = await classifyAttempt(spec, state, model, options);
  if (!attempt.requested) return { result: null, charge: null };
  const measured = attempt.result?.costMicrocents ?? null;
  const charge: ClassifierCharge = {
    use,
    model,
    costMicrocents: measured ?? estimateClassifierCostMicrocents(model, spec, state),
    measured: measured !== null,
    answered: attempt.result !== null,
  };
  collector.getStore()?.push(charge);
  return { result: attempt.result, charge };
}
