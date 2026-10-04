import { describe, expect, it } from "vitest";
import { getAgentProviderOptions } from "../agent-provider-options";
import { SHIPPED_AGENT_MODEL } from "../model-catalog";

describe("Agent provider options", () => {
  it.each([SHIPPED_AGENT_MODEL])("preserves the serving provider and inference region for $modelId", (model) => {
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
    expect(getAgentProviderOptions("ovh", "eu")).toEqual({ openai: { parallelToolCalls: false } });
  });
});
