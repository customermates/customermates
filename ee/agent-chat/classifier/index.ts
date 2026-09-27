import type { ClassifierModel, ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { GeminiRunnerOptions } from "./gemini-runner";
import type { JevRunnerOptions } from "./jev-runner";

import { env } from "@/env";

import { runGemini } from "./gemini-runner";
import { runJev } from "./jev-runner";
import { classifierSpecProblems } from "./spec";

export type ClassifyOptions = {
  jev?: Partial<JevRunnerOptions>;
  gemini?: GeminiRunnerOptions;
};

export type ClassifierAttempt = { result: ClassifierResult | null; requested: boolean };

export async function classifyAttempt(
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  options: ClassifyOptions = {},
): Promise<ClassifierAttempt> {
  if (classifierSpecProblems(spec).length > 0) return { result: null, requested: false };
  const apiKey = model === "jev" ? (options.jev?.apiKey ?? env.AI_GATEWAY_API_KEY?.trim()) : undefined;
  if (model === "jev" && !apiKey) return { result: null, requested: false };
  try {
    const result =
      model === "gemini"
        ? await runGemini(spec, state, options.gemini)
        : await runJev(spec, state, { ...options.jev, apiKey: apiKey as string });
    return { result, requested: true };
  } catch {
    return { result: null, requested: true };
  }
}

export async function classify(
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  options: ClassifyOptions = {},
): Promise<ClassifierResult | null> {
  return (await classifyAttempt(spec, state, model, options)).result;
}

export type * from "./spec";
