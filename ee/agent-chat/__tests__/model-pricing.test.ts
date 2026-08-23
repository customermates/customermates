import { describe, expect, it } from "vitest";

import {
  computeCostMicrocents,
  lowestModelPromptTierBoundary,
  modelPromptTierBoundaries,
  pinnedModelEndpoints,
  promptTokensOf,
  resolveModelPricing,
} from "../model-pricing";

const GATEWAY_ID = "openai/gpt-5.6-luna";
const NATIVE_ID = "gpt-5.6-luna";
const BOUNDARY = 272_000;

describe("pinned pricing snapshot", () => {
  it("validates at module load and pins the configured endpoint", () => {
    expect(pinnedModelEndpoints()).toEqual(expect.arrayContaining([{ modelId: GATEWAY_ID, provider: "openai" }]));
    expect(
      pinnedModelEndpoints()
        .map((endpoint) => endpoint.modelId)
        .toSorted(),
    ).toEqual(["openai/gpt-5-nano", "openai/gpt-5.6-luna"]);
  });

  it("resolves by gateway id and by provider-native id alike", () => {
    expect(resolveModelPricing(GATEWAY_ID)).toEqual(resolveModelPricing(NATIVE_ID));
  });

  it("refuses an unpinned model rather than substituting a fallback rate", () => {
    expect(() => resolveModelPricing("openai/not-pinned")).toThrow(/No pinned pricing/);
  });

  it("exposes the model's own tier boundaries so the budget envelope can be derived per model", () => {
    expect(modelPromptTierBoundaries(GATEWAY_ID)).toEqual([BOUNDARY]);
    expect(lowestModelPromptTierBoundary(GATEWAY_ID)).toBe(BOUNDARY);
  });
});

describe("tier selection", () => {
  it("uses the base tier below the boundary", () => {
    expect(resolveModelPricing(GATEWAY_ID, BOUNDARY - 1)).toEqual({
      inputPerMTok: 0.2,
      outputPerMTok: 1.2,
      cacheReadPerMTok: 0.02,
      cacheWritePerMTok: 0.25,
    });
  });

  it("uses the long-context tier from the boundary upward", () => {
    expect(resolveModelPricing(GATEWAY_ID, BOUNDARY)).toEqual({
      inputPerMTok: 0.4,
      outputPerMTok: 1.8,
      cacheReadPerMTok: 0.04,
      cacheWritePerMTok: 0.5,
    });
  });

  it("resolves a tier whose lower bound is omitted in the catalog to the cheap segment", () => {
    expect(resolveModelPricing(GATEWAY_ID, 0).cacheReadPerMTok).toBe(0.02);
    expect(resolveModelPricing(GATEWAY_ID, 1).cacheReadPerMTok).toBe(0.02);
  });
});

describe("cost", () => {
  const tokens = (
    over: Partial<Record<"inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens", number>>,
  ) => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...over,
  });

  it("counts the whole prompt, cached parts included, when selecting the tier", () => {
    expect(promptTokensOf(tokens({ inputTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 5 }))).toBe(125);
  });

  it("prices the entire request at the long-context rate once the prompt crosses the boundary", () => {
    const wholeRequest = computeCostMicrocents(GATEWAY_ID, tokens({ inputTokens: BOUNDARY, outputTokens: 1_000 }));
    const marginal = Math.round(BOUNDARY * 0.4 * 100 + 1_000 * 1.8 * 100);

    expect(wholeRequest).toBe(marginal);
  });

  it("does not apply the long-context rate one token below the boundary", () => {
    const below = computeCostMicrocents(GATEWAY_ID, tokens({ inputTokens: BOUNDARY - 1 }));

    expect(below).toBe(Math.round((BOUNDARY - 1) * 0.2 * 100));
  });

  it("lets a cache-heavy prompt cross the boundary on its total size", () => {
    const cacheHeavy = tokens({ inputTokens: 100_000, cacheReadTokens: 180_000 });

    expect(promptTokensOf(cacheHeavy)).toBeGreaterThan(BOUNDARY);
    expect(computeCostMicrocents(GATEWAY_ID, cacheHeavy)).toBe(Math.round(100_000 * 0.4 * 100 + 180_000 * 0.04 * 100));
  });

  it("rejects non-integer usage rather than metering it", () => {
    expect(() => computeCostMicrocents(GATEWAY_ID, tokens({ inputTokens: -1 }))).toThrow(/Invalid inputTokens/);
  });
});
