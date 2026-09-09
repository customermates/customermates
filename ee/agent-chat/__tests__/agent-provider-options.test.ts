import { describe, expect, it } from "vitest";

import { AGENT_SERVING_PROVIDER, getAgentProviderOptions } from "../agent-provider-options";

describe("Agent provider options", () => {
  it("pins hosted Assistant traffic to Azure with the shared privacy settings", () => {
    expect(getAgentProviderOptions(AGENT_SERVING_PROVIDER)).toEqual({
      gateway: {
        only: ["azure"],
        zeroDataRetention: true,
        disallowPromptTraining: true,
      },
      openai: { parallelToolCalls: false, store: false, maxToolCalls: 1 },
    });
  });

  it("fails closed for a non-Azure serving provider", () => {
    expect(() => getAgentProviderOptions("openai")).toThrow("Hosted Assistant requires Azure.");
  });
});
