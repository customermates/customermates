import { describe, expect, it } from "vitest";

import { googleThinkingProviderOptions } from "../agent-thinking-options";

describe("google thinking provider options", () => {
  it("adds nothing when the model has no thinking level", () => {
    expect(googleThinkingProviderOptions({ servingProvider: "vertex" })).toEqual({});
  });

  it("targets the serving provider namespace the gateway expects", () => {
    expect(googleThinkingProviderOptions({ servingProvider: "vertex", thinkingLevel: "medium" })).toEqual({
      vertex: { thinkingConfig: { thinkingLevel: "medium" } },
    });
    expect(googleThinkingProviderOptions({ servingProvider: "google", thinkingLevel: "low" })).toEqual({
      google: { thinkingConfig: { thinkingLevel: "low" } },
    });
  });

  it("never sends a Google thinking config to another provider", () => {
    expect(googleThinkingProviderOptions({ servingProvider: "azure", thinkingLevel: "high" })).toEqual({});
  });
});
