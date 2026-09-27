import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./spec";

import { readAgentProviderCharge } from "../gateway-cost";

import { parseClassifierAnswers } from "./spec";

export const JEV_EVALUATE_URL = "https://ai-gateway.vercel.sh/v1/evaluate";
export const JEV_MODEL_ID = "typesafe-ai/jev";
export const JEV_SERVING_PROVIDER = "typesafe-ai";
export const JEV_DEADLINE_MS = 800;

export type JevRunnerOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

function jevQuestion(question: ClassifierSpec["questions"][number]) {
  if (question.type === "choice")
    return { type: "choice", instructions: question.instruction, criteria: question.options };
  if (question.type === "score")
    return { type: "score", instructions: question.instruction, criteria: question.levels };
  return {
    type: "boolean",
    instructions: question.instruction,
    ...(question.criteria ? { criteria: question.criteria } : {}),
  };
}

export function jevRequestBody(spec: ClassifierSpec, state: ClassifierState) {
  return {
    model: JEV_MODEL_ID,
    state,
    questions: Object.fromEntries(spec.questions.map((question) => [question.id, jevQuestion(question)])),
    providerOptions: {
      gateway: { only: [JEV_SERVING_PROVIDER], zeroDataRetention: true, disallowPromptTraining: true },
    },
  };
}

export async function runJev(
  spec: ClassifierSpec,
  state: ClassifierState,
  options: JevRunnerOptions,
): Promise<ClassifierResult> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const response = await (options.fetch ?? fetch)(JEV_EVALUATE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(jevRequestBody(spec, state)),
    signal: AbortSignal.timeout(options.timeoutMs ?? JEV_DEADLINE_MS),
  });
  if (!response.ok) throw new Error(`the evaluation endpoint answered ${response.status}`);
  const body = (await response.json()) as { answers?: unknown; providerMetadata?: unknown };
  const answers = parseClassifierAnswers(spec, body.answers);
  if (!answers) throw new Error("the evaluation endpoint returned answers that do not match the spec");
  const charge = readAgentProviderCharge(body.providerMetadata, JEV_SERVING_PROVIDER);
  return {
    model: "jev",
    answers,
    costMicrocents: charge.outcome === "measured" ? charge.charge.costMicrocents : null,
    latencyMs: now() - started,
  };
}
