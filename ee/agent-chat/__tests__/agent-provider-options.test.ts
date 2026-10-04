import { describe, expect, it } from "vitest";
import { getAgentProviderOptions } from "../agent-provider-options";
import { SHIPPED_AGENT_MODEL } from "../model-catalog";

describe("Agent provider options", () => {
  it("serves the shipped model directly from OVHcloud AI Endpoints, with no Gateway routing block", () => {
    expect(SHIPPED_AGENT_MODEL).toMatchObject({ servingProvider: "ovh", inferenceRegion: "eu" });
    expect(getAgentProviderOptions(SHIPPED_AGENT_MODEL.servingProvider, SHIPPED_AGENT_MODEL.inferenceRegion)).toEqual({
      openai: {},
    });
  });

  it.each([
    { modelId: "google/gemini-3.5-flash-lite", servingProvider: "vertex", inferenceRegion: "eu" as const },
    { modelId: "openai/gpt-5.6-luna", servingProvider: "azure", inferenceRegion: null },
  ])("preserves the serving provider and inference region for Gateway model $modelId", (model) => {
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
    expect(getAgentProviderOptions("vertex", "eu").gateway?.inferenceRegion).toEqual({
      scope: "zone",
      geoRegion: "eu",
    });
  });

  it("sends an OVHcloud AI Endpoints round no gateway routing, caching or store flag", () => {
    expect(getAgentProviderOptions("ovh", "eu")).toEqual({ openai: {} });
  });
});
