import { describe, expect, it } from "vitest";
import { getAgentProviderOptions, getStructuredCallProviderOptions } from "../agent-provider-options";
import { AGENT_MODELS } from "../model-catalog";

describe("Agent provider options", () => {
  it.each([AGENT_MODELS.chat])("preserves the serving provider and inference region for $modelId", (model) => {
    expect(getAgentProviderOptions(model.servingProvider, model.inferenceRegion)).toEqual({
      gateway: {
        only: [model.servingProvider],
        ...(model.inferenceRegion ? { inferenceRegion: { scope: "zone", geoRegion: model.inferenceRegion } } : {}),
        zeroDataRetention: true,
        disallowPromptTraining: true,
        caching: "auto",
      },
      openai: { parallelToolCalls: false, store: false },
    });
  });

  it("omits the inference region for a model without one instead of sending a global scope", () => {
    expect(getAgentProviderOptions("azure", null).gateway).not.toHaveProperty("inferenceRegion");
    expect(getAgentProviderOptions("vertex", "eu").gateway.inferenceRegion).toEqual({ scope: "zone", geoRegion: "eu" });
  });

  it("routes one-shot structured calls the same way without Gateway caching, whose write no later call reads", () => {
    const { caching: _caching, ...routing } = getAgentProviderOptions("vertexAnthropic", "eu").gateway;

    expect(getStructuredCallProviderOptions("vertexAnthropic", "eu")).toEqual({ gateway: routing });
    expect(getStructuredCallProviderOptions("vertexAnthropic", "eu").gateway).not.toHaveProperty("caching");
    expect(getStructuredCallProviderOptions("azure").gateway).not.toHaveProperty("inferenceRegion");
  });
});
