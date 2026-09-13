import type { AgentModelEntry } from "./model-catalog";

export function getAgentProviderOptions(
  servingProvider: string,
  inferenceRegion: AgentModelEntry["inferenceRegion"] = null,
) {
  return {
    gateway: {
      only: [servingProvider],
      inferenceRegion: inferenceRegion
        ? { scope: "zone" as const, geoRegion: inferenceRegion }
        : { scope: "global" as const },
      zeroDataRetention: true,
      disallowPromptTraining: true,
    },
    openai: {
      parallelToolCalls: false,
      store: false,
    },
  };
}
