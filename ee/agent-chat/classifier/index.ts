import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";
import type { ClassifierFailure, JevRunnerOptions } from "./jev-runner";

import { getVercelOidcToken } from "@vercel/oidc";

import { env } from "@/env";

import { classifierFailureOf, runJev } from "./jev-runner";
import { classifierSpecProblems } from "./spec";

export type ClassifyOptions = Partial<JevRunnerOptions>;

type ClassifierAttempt = { result: ClassifierResult | null; requested: boolean; failure?: ClassifierFailure };

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

export async function classifyAttempt(
  spec: ClassifierSpec,
  state: ClassifierState,
  options: ClassifyOptions = {},
): Promise<ClassifierAttempt> {
  if (classifierSpecProblems(spec).length > 0) return { result: null, requested: false };
  const credential = await gatewayCredential(options.apiKey);
  if (!credential) return { result: null, requested: false };
  try {
    return { result: await runJev(spec, state, { ...options, ...credential }), requested: true };
  } catch (error) {
    return { result: null, requested: true, failure: classifierFailureOf(error) };
  }
}

export type * from "./spec";
