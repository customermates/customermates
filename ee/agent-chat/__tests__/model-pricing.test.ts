import { describe, expect, it } from "vitest";

import {
  computeCostMicrocents,
  lowestModelPromptTierBoundary,
  modelPromptTierBoundaries,
  pinnedModelEndpoints,
  promptTokensOf,
  resolveModelPricing,
} from "../model-pricing";
import { AGENT_MODELS } from "../model-catalog";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER } from "../classifier/jev-runner";

const GATEWAY_ID = "anthropic/claude-haiku-5.5";
const NATIVE_ID = "claude-haiku-5.5";
const PROVIDER = "vertexAnthropic";
const REGION = "eu";
const BOUNDARY = 100_001;

describe("pinned pricing snapshot", () => {
  it("validates at module load and pins exactly the endpoints the product serves", () => {
    expect(pinnedModelEndpoints()).toEqual(
      expect.arrayContaining([{ modelId: GATEWAY_ID, provider: PROVIDER, inferenceRegion: REGION }]),
    );
    const pinKey = (endpoint: { modelId: string; provider: string; inferenceRegion: string | null }) =>
      `${endpoint.modelId}|${endpoint.provider}|${endpoint.inferenceRegion ?? ""}`;
    const pinned = pinnedModelEndpoints().map(pinKey);
    const catalogPins = Object.values(AGENT_MODELS).map((entry) =>
      pinKey({ modelId: entry.modelId, provider: entry.servingProvider, inferenceRegion: entry.inferenceRegion }),
    );
    const classifierPins = [pinKey({ modelId: JEV_MODEL_ID, provider: JEV_PRICING_PROVIDER, inferenceRegion: null })];
    expect(new Set(pinned).size).toBe(pinned.length);
    expect(pinned).toEqual(expect.arrayContaining(catalogPins));
    expect(pinned).toEqual(expect.arrayContaining(classifierPins));
    expect(pinned.filter((key) => !catalogPins.includes(key) && !classifierPins.includes(key))).toEqual([]);
  });

  it("resolves by gateway id and by provider-native id alike", () => {
    expect(resolveModelPricing(GATEWAY_ID, 0, PROVIDER, REGION)).toEqual(
      resolveModelPricing(NATIVE_ID, 0, PROVIDER, REGION),
    );
  });

  it("refuses an unpinned model rather than substituting a fallback rate", () => {
    expect(() => resolveModelPricing("openai/not-pinned")).toThrow(/No pinned pricing/);
  });

  it("exposes the model's own tier boundaries so the budget envelope can be derived per model", () => {
    expect(modelPromptTierBoundaries(GATEWAY_ID)).toEqual([BOUNDARY]);
    expect(lowestModelPromptTierBoundary(GATEWAY_ID)).toBe(BOUNDARY);
    expect(modelPromptTierBoundaries(JEV_MODEL_ID, JEV_PRICING_PROVIDER)).toEqual([]);
    expect(lowestModelPromptTierBoundary(JEV_MODEL_ID, JEV_PRICING_PROVIDER)).toBeNull();
  });

  it("pins Haiku to the EU Vertex Anthropic rate and refuses an unpriced regional or provider substitute", () => {
    expect(resolveModelPricing(GATEWAY_ID, 0, PROVIDER, REGION)).toEqual({
      inputPerMTok: 0.11,
      outputPerMTok: 0.55,
      cacheReadPerMTok: 0.011,
      cacheWritePerMTok: 0.1375,
      cacheWrite1hPerMTok: 0.22,
    });
    expect(() => resolveModelPricing(GATEWAY_ID, 0, PROVIDER, "us")).toThrow(/No pinned pricing/);
    expect(() => resolveModelPricing(GATEWAY_ID, 0, PROVIDER, null)).toThrow(/global routing/);
    expect(() => resolveModelPricing(GATEWAY_ID, 0, "anthropic", REGION)).toThrow(/No pinned pricing/);
  });
});

describe("tier selection", () => {
  it("uses the base tier below the boundary", () => {
    expect(resolveModelPricing(GATEWAY_ID, BOUNDARY - 1)).toEqual({
      inputPerMTok: 0.11,
      outputPerMTok: 0.55,
      cacheReadPerMTok: 0.011,
      cacheWritePerMTok: 0.1375,
      cacheWrite1hPerMTok: 0.22,
    });
  });

  it("uses the long-context tier from the boundary upward", () => {
    expect(resolveModelPricing(GATEWAY_ID, BOUNDARY)).toEqual({
      inputPerMTok: 0.55,
      outputPerMTok: 2.75,
      cacheReadPerMTok: 0.055,
      cacheWritePerMTok: 0.6875,
      cacheWrite1hPerMTok: 1.1,
    });
  });

  it("prices one-hour cache writes at twice the input rate wherever the endpoint bills cache writes", () => {
    for (const endpoint of pinnedModelEndpoints()) {
      for (const promptTokens of [0, BOUNDARY - 1, BOUNDARY, 1_000_000]) {
        const pricing = resolveModelPricing(
          endpoint.modelId,
          promptTokens,
          endpoint.provider,
          endpoint.inferenceRegion,
        );
        expect(pricing.cacheWrite1hPerMTok).toBe(pricing.cacheWritePerMTok > 0 ? 2 * pricing.inputPerMTok : 0);
      }
    }
  });

  it("resolves a tier whose bounds are omitted in the catalog for every prompt size", () => {
    for (const promptTokens of [0, 1, BOUNDARY, 1_000_000]) {
      expect(resolveModelPricing(JEV_MODEL_ID, promptTokens, JEV_PRICING_PROVIDER, null)).toEqual({
        inputPerMTok: 0.042,
        outputPerMTok: 0,
        cacheReadPerMTok: 0.042,
        cacheWritePerMTok: 0,
        cacheWrite1hPerMTok: 0,
      });
    }
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
    const marginal = Math.round(BOUNDARY * 0.55 * 100 + 1_000 * 2.75 * 100);

    expect(wholeRequest).toBe(marginal);
    expect(wholeRequest).toBe(5_775_055);
  });

  it("does not apply the long-context rate one token below the boundary", () => {
    const below = computeCostMicrocents(GATEWAY_ID, tokens({ inputTokens: BOUNDARY - 1 }));

    expect(below).toBe(Math.round((BOUNDARY - 1) * 0.11 * 100));
    expect(below).toBe(1_100_000);
  });

  it("lets a cache-heavy prompt cross the boundary on its total size", () => {
    const cacheHeavy = tokens({ inputTokens: 60_000, cacheReadTokens: 50_000 });

    expect(cacheHeavy.inputTokens).toBeLessThan(BOUNDARY);
    expect(promptTokensOf(cacheHeavy)).toBeGreaterThan(BOUNDARY);
    expect(computeCostMicrocents(GATEWAY_ID, cacheHeavy)).toBe(Math.round(60_000 * 0.55 * 100 + 50_000 * 0.055 * 100));
    expect(computeCostMicrocents(GATEWAY_ID, cacheHeavy)).toBe(3_575_000);
  });

  it("rejects non-integer usage rather than metering it", () => {
    expect(() => computeCostMicrocents(GATEWAY_ID, tokens({ inputTokens: -1 }))).toThrow(/Invalid inputTokens/);
  });
});

describe("measured against the live gateway", () => {
  const MEASURED = [
    {
      label: "a short call",
      tokens: { inputTokens: 46, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 },
      microcents: 726,
    },
    {
      label: "78,350 prompt tokens, under the long-context boundary",
      tokens: { inputTokens: 4, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 78_346 },
      microcents: 1_077_522,
    },
    {
      label: "108,047 prompt tokens, over the boundary on cached tokens alone",
      tokens: { inputTokens: 4, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 108_043 },
      microcents: 7_429_276,
    },
  ];

  it.each(MEASURED)("prices $label exactly as the gateway's token cost", ({ tokens, microcents }) => {
    expect(computeCostMicrocents(GATEWAY_ID, tokens, PROVIDER, REGION)).toBe(microcents);
  });

  it("counts cached tokens toward the long-context boundary, as the provider does", () => {
    const cachedOnly = { inputTokens: 4, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 108_043 };

    expect(promptTokensOf(cachedOnly)).toBeGreaterThan(BOUNDARY);
    expect(cachedOnly.inputTokens).toBeLessThan(BOUNDARY);
    expect(resolveModelPricing(GATEWAY_ID, promptTokensOf(cachedOnly), PROVIDER, REGION).inputPerMTok).toBe(0.55);
    expect(computeCostMicrocents(GATEWAY_ID, cachedOnly, PROVIDER, REGION)).toBe(7_429_276);

    const tier1 = resolveModelPricing(GATEWAY_ID, 0, PROVIDER, REGION);
    const ifOnlyUncachedCounted = Math.round(
      (cachedOnly.inputTokens * tier1.inputPerMTok +
        cachedOnly.outputTokens * tier1.outputPerMTok +
        cachedOnly.cacheWriteTokens * tier1.cacheWritePerMTok) *
        100,
    );

    expect(ifOnlyUncachedCounted).toBe(1_485_855);
    expect(computeCostMicrocents(GATEWAY_ID, cachedOnly, PROVIDER, REGION) - ifOnlyUncachedCounted).toBe(5_943_421);
  });
});
