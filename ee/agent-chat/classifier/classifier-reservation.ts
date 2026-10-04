import type { ClassifierModel } from "./models";
import type { ClassifierSpec, ClassifierState } from "./spec";

import { computeCostMicrocents } from "../model-pricing";
import { AGENT_MIN_BYTES_PER_PROVIDER_TOKEN, AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS } from "../agent-model";

import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "./jev-runner";
import { classifierMaxOutputTokens, classifierTokenCostMicrocents, ovhClassifierRequestBytes } from "./ovh-runner";

function providerInputTokens(bytes: number) {
  return Math.ceil(bytes / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS;
}

export function classifierReservationMicrocents(
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
): number {
  if (model === "jev") {
    const bytes = new TextEncoder().encode(JSON.stringify(jevRequestBody(spec, state))).byteLength;
    return computeCostMicrocents(
      JEV_MODEL_ID,
      { inputTokens: providerInputTokens(bytes), outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      JEV_PRICING_PROVIDER,
      null,
    );
  }
  return classifierTokenCostMicrocents(
    model,
    providerInputTokens(ovhClassifierRequestBytes(spec, state, model)),
    classifierMaxOutputTokens(spec),
  );
}
