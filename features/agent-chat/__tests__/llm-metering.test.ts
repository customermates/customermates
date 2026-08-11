import { describe, it, expect, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, AGENT_MODEL: "openai:gpt-5.6-luna" },
}));

import { hasProviderUsageEvidence, usageToTokenCounts, laneModelId } from "../llm.service";
import { resolveModelPricing } from "../model-pricing";

describe("usageToTokenCounts", () => {
  it("maps the AI SDK v6 inputTokenDetails onto the 4-class TokenCounts (cacheWrite is first-class, not lost)", () => {
    const usage = {
      inputTokens: 27000,
      inputTokenDetails: { noCacheTokens: 27, cacheReadTokens: 0, cacheWriteTokens: 26973 },
      outputTokens: 150,
      outputTokenDetails: { textTokens: 150, reasoningTokens: 0 },
      totalTokens: 27150,
    } as never;

    expect(usageToTokenCounts(usage)).toEqual({
      inputTokens: 27,
      outputTokens: 150,
      cacheReadTokens: 0,
      cacheWriteTokens: 26973,
    });
  });

  it("reads a warm cache-read turn", () => {
    const usage = {
      inputTokens: 23346,
      inputTokenDetails: { noCacheTokens: 17, cacheReadTokens: 23329, cacheWriteTokens: 0 },
      outputTokens: 144,
    } as never;

    expect(usageToTokenCounts(usage)).toMatchObject({ inputTokens: 17, cacheReadTokens: 23329, cacheWriteTokens: 0 });
  });

  it("falls back to inputTokens minus cache classes when a provider omits inputTokenDetails", () => {
    const usage = { inputTokens: 100, outputTokens: 20, cachedInputTokens: 30 } as never;

    expect(usageToTokenCounts(usage)).toEqual({
      inputTokens: 70,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheWriteTokens: 0,
    });
  });

  it("maps missing fields to zero but never treats them as proven provider usage", () => {
    expect(usageToTokenCounts({} as never)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(hasProviderUsageEvidence({} as never)).toBe(false);
    expect(hasProviderUsageEvidence({ inputTokens: 0, outputTokens: 0 } as never)).toBe(true);
  });

  it.each([{ inputTokens: -1 }, { outputTokens: Number.NaN }, { inputTokenDetails: { cacheReadTokens: 1.5 } }])(
    "rejects malformed provider usage %#",
    (usage) => {
      expect(() => usageToTokenCounts(usage as never)).toThrow("reported by the AI provider");
    },
  );
});

describe("laneModelId + pricing coverage", () => {
  it("strips the provider prefix from the model spec", () => {
    expect(laneModelId("agent")).toBe("gpt-5.6-luna");
  });

  it("the configured agent model has a real pricing row (never the UNKNOWN_MODEL_PRICING spend-cap trap)", () => {
    const unknown = resolveModelPricing("definitely-not-a-real-model");
    expect(resolveModelPricing(laneModelId("agent"))).not.toEqual(unknown);
  });
});
