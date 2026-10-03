import type { ClassifierSpec, ClassifierState } from "./spec";

import { computeCostMicrocents, type TokenCounts } from "../model-pricing";
import { AGENT_MIN_BYTES_PER_PROVIDER_TOKEN, AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS } from "../agent-model";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER, jevRequestBody } from "./jev-runner";

export function classifierReservationMicrocents(spec: ClassifierSpec, state: ClassifierState): number {
  const bytes = new TextEncoder().encode(JSON.stringify(jevRequestBody(spec, state))).byteLength;
  const tokens: TokenCounts = {
    inputTokens: Math.ceil(bytes / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) + AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  return computeCostMicrocents(JEV_MODEL_ID, tokens, JEV_PRICING_PROVIDER, null);
}
