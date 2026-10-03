import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { JevRunnerOptions } from "./jev-runner";

import { env } from "@/env";

import { runJev } from "./jev-runner";
import { classifierSpecProblems } from "./spec";

export type ClassifyOptions = Partial<JevRunnerOptions>;

type ClassifierAttempt = { result: ClassifierResult | null; requested: boolean };

export async function classifyAttempt(
  spec: ClassifierSpec,
  state: ClassifierState,
  options: ClassifyOptions = {},
): Promise<ClassifierAttempt> {
  if (classifierSpecProblems(spec).length > 0) return { result: null, requested: false };
  const apiKey = options.apiKey ?? env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return { result: null, requested: false };
  try {
    return { result: await runJev(spec, state, { ...options, apiKey }), requested: true };
  } catch {
    return { result: null, requested: true };
  }
}

export type * from "./spec";
