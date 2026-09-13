import { describe, expect, it } from "vitest";
import { getAgentProviderOptions } from "../agent-provider-options";
import { MODEL_CATALOG } from "../model-catalog";

describe("Agent provider options", () => {
  it.each(Object.values(MODEL_CATALOG))("preserves the serving provider and inference region for $modelId", (model) => {
    expect(getAgentProviderOptions(model.servingProvider, model.inferenceRegion)).toEqual({
      gateway: {
        only: [model.servingProvider],
        inferenceRegion: model.inferenceRegion
          ? { scope: "zone", geoRegion: model.inferenceRegion }
          : { scope: "global" },
        zeroDataRetention: true,
        disallowPromptTraining: true,
      },
      openai: { parallelToolCalls: false, store: false },
    });
  });
});
