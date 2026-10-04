import type { ClassifierModel, ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { ClassifierFailure } from "./failure";
import type { ClassifierUse } from "./models";
import type { ClassifyOptions } from "./index";

import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "@/env";

import { classifyAttempt } from "./index";
import { computeCostMicrocents } from "../model-pricing";

import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "./jev-runner";
import { CLASSIFIER_MODELS } from "./models";
import { classifierMaxOutputTokens, classifierTokenCostMicrocents, ovhClassifierRequestBytes } from "./ovh-runner";

export type ClassifierCharge = {
  use: ClassifierUse;
  model: ClassifierModel;
  costMicrocents: number;
  measured: boolean;
  answered: boolean;
};

const ESTIMATE_BYTES_PER_TOKEN = 3;

function estimatedTokens(text: string) {
  return Math.ceil(Buffer.byteLength(text, "utf8") / ESTIMATE_BYTES_PER_TOKEN);
}

const collector = new AsyncLocalStorage<ClassifierCharge[]>();

export async function collectClassifierCharges<T>(
  run: () => Promise<T>,
): Promise<{ value: T; charges: ClassifierCharge[] }> {
  const charges: ClassifierCharge[] = [];
  const value = await collector.run(charges, run);
  return { value, charges };
}

export function hostedDocsRerankModel(): ClassifierModel | null {
  return env.APP_MODE === "self-hosted" ? null : CLASSIFIER_MODELS.docs_rerank;
}

export function estimateClassifierCostMicrocents(
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
): number {
  if (model === "jev") {
    return computeCostMicrocents(
      JEV_MODEL_ID,
      {
        inputTokens: estimatedTokens(JSON.stringify(jevRequestBody(spec, state))),
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      JEV_PRICING_PROVIDER,
      null,
    );
  }
  return classifierTokenCostMicrocents(
    model,
    Math.ceil(ovhClassifierRequestBytes(spec, state, model) / ESTIMATE_BYTES_PER_TOKEN),
    classifierMaxOutputTokens(spec),
  );
}

export async function classifyMetered(
  use: ClassifierUse,
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  options: ClassifyOptions = {},
): Promise<{ result: ClassifierResult | null; charge: ClassifierCharge | null; failure?: ClassifierFailure }> {
  const attempt = await classifyAttempt(spec, state, model, options);
  if (!attempt.requested) return { result: null, charge: null };
  const measured = attempt.result?.costMicrocents ?? attempt.costMicrocents ?? null;
  const charge: ClassifierCharge = {
    use,
    model,
    costMicrocents: measured ?? estimateClassifierCostMicrocents(spec, state, model),
    measured: measured !== null,
    answered: attempt.result !== null,
  };
  collector.getStore()?.push(charge);
  return { result: attempt.result, charge, ...(attempt.failure ? { failure: attempt.failure } : {}) };
}
