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

export async function classify(
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  options: ClassifyOptions = {},
): Promise<ClassifierResult | null> {
  try {
    if (classifierSpecProblems(spec).length > 0) return null;
    if (model === "gemini") return await runGemini(spec, state, options.gemini);
    const apiKey = options.jev?.apiKey ?? env.AI_GATEWAY_API_KEY?.trim();
    if (!apiKey) return null;
    return await runJev(spec, state, { ...options.jev, apiKey });
  } catch {
    return null;
  }
}

export type * from "./spec";
