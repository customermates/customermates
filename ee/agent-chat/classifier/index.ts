import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { ClassifierFailure } from "./failure";
import type { JevRunnerOptions } from "./jev-runner";
import type { ClassifierModel } from "./models";
import type { OvhClassifierModel } from "./ovh-runner";

import { getVercelOidcToken } from "@vercel/oidc";

import { env } from "@/env";

import { configuredOvhApiKey } from "../ovh-ai-endpoints-catalog";

import { ClassifierRequestError, classifierFailureOf } from "./failure";
import { runJev } from "./jev-runner";
import { runOvhClassifier } from "./ovh-runner";
import { classifierSpecProblems } from "./spec";

export type ClassifyOptions = Partial<JevRunnerOptions>;

type ClassifierAttempt = {
  result: ClassifierResult | null;
  requested: boolean;
  failure?: ClassifierFailure;
  costMicrocents?: number | null;
};

type Runner = () => Promise<ClassifierResult>;

async function gatewayCredential(apiKey: string | undefined) {
  const key = apiKey ?? env.AI_GATEWAY_API_KEY?.trim();
  if (key) return { apiKey: key, authMethod: "api-key" as const };
  try {
    const token = await getVercelOidcToken();
    return token ? { apiKey: token, authMethod: "oidc" as const } : null;
  } catch {
    return null;
  }
}

async function runnerFor(
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  options: ClassifyOptions,
): Promise<Runner | null> {
  if (model === "jev") {
    const credential = await gatewayCredential(options.apiKey);
    return credential ? () => runJev(spec, state, { ...options, ...credential }) : null;
  }
  const apiKey = configuredOvhApiKey(options.apiKey ?? env.OVH_AI_ENDPOINTS_API_KEY);
  const ovhModel: OvhClassifierModel = model;
  return apiKey
    ? () =>
        runOvhClassifier(spec, state, {
          model: ovhModel,
          apiKey,
          ...(options.fetch ? { fetch: options.fetch } : {}),
          ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
          ...(options.now ? { now: options.now } : {}),
        })
    : null;
}

export async function classifyAttempt(
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  options: ClassifyOptions = {},
): Promise<ClassifierAttempt> {
  if (classifierSpecProblems(spec).length > 0) return { result: null, requested: false };
  const run = await runnerFor(spec, state, model, options);
  if (!run) return { result: null, requested: false };
  try {
    return { result: await run(), requested: true };
  } catch (error) {
    const costMicrocents = error instanceof ClassifierRequestError ? error.costMicrocents : null;
    return {
      result: null,
      requested: true,
      failure: classifierFailureOf(error),
      ...(costMicrocents !== null ? { costMicrocents } : {}),
    };
  }
}

export type * from "./spec";
