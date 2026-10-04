import { describe, expect, it } from "vitest";

import { MODEL_PRICING_SNAPSHOT } from "@/ee/agent-chat/model-pricing.snapshot";

import { ovhPricingEndpoint } from "../refresh-agent-model-pricing";

const CATALOG = {
  object: "list",
  data: [
    {
      id: "gpt-oss-120b",
      object: "model",
      owned_by: "OpenAI",
      pricing: {
        currency_unit: "USD",
        completion: "0.00000047",
        image: "0",
        prompt: "0.00000009",
        request: "0",
        input_cache_reads: "0",
        input_cache_writes: "0",
      },
      context_length: 131072,
      max_completion_tokens: 131072,
    },
    {
      id: "priced-in-euro",
      pricing: {
        currency_unit: "EUR",
        prompt: "1",
        completion: "1",
        request: "0",
        input_cache_reads: "0",
        input_cache_writes: "0",
      },
      context_length: 1000,
    },
  ],
};

describe("OVH pricing refresh", () => {
  it("pins an OVH catalog model as an eu endpoint with exact decimal strings", () => {
    const endpoint = ovhPricingEndpoint("gpt-oss-120b", CATALOG);

    expect(endpoint).toEqual({
      modelId: "ovh/gpt-oss-120b",
      providerNativeModelId: "gpt-oss-120b",
      provider: "ovh",
      inferenceRegion: "eu",
      contextLength: 131072,
      maxCompletionTokens: 131072,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [{ costUsdPerToken: "0.00000009" }],
      completion: [{ costUsdPerToken: "0.00000047" }],
      inputCacheRead: [{ costUsdPerToken: "0" }],
      inputCacheWrite: [{ costUsdPerToken: "0" }],
    });
    expect(MODEL_PRICING_SNAPSHOT.endpoints).toContainEqual(endpoint);
  });

  it("refuses a missing, non-USD or unpriced OVH model rather than pinning a guess", () => {
    expect(() => ovhPricingEndpoint("Qwen3.8-27B", CATALOG)).toThrow(
      "no longer contains Qwen3.8-27B",
    );
    expect(() => ovhPricingEndpoint("priced-in-euro", CATALOG)).toThrow(
      "priced in EUR",
    );
    const unpriced = {
      data: [
        {
          ...CATALOG.data[0],
          pricing: { ...CATALOG.data[0].pricing, prompt: 0.1 },
        },
      ],
    };
    expect(() => ovhPricingEndpoint("gpt-oss-120b", unpriced)).toThrow(
      "missing prompt",
    );
  });

  it("keeps every audited OVH model pinned in the snapshot", () => {
    const ovh = MODEL_PRICING_SNAPSHOT.endpoints.filter(
      (endpoint) => endpoint.provider === "ovh",
    );
    expect(ovh.map((endpoint) => endpoint.modelId).sort()).toEqual([
      "ovh/Mistral-Small-3.2-24B-Instruct-2506",
      "ovh/Qwen3-Coder-30B-A3B-Instruct",
      "ovh/Qwen3.5-397B-A17B",
      "ovh/Qwen3.8-27B",
      "ovh/gpt-oss-120b",
    ]);
  });
});
