import type { AgentModelEntry } from "./model-catalog";

import { agentServingProviderUsesGateway } from "./ovh-ai-endpoints-catalog";

export type AgentProviderOptions = {
  gateway?: {
    only: string[];
    inferenceRegion?: { scope: "zone"; geoRegion: NonNullable<AgentModelEntry["inferenceRegion"]> };
    zeroDataRetention: true;
    disallowPromptTraining: true;
    caching: "auto";
  };
  openai: { parallelToolCalls?: false; store?: false };
};

export function getAgentProviderOptions(
  servingProvider: string,
  inferenceRegion: AgentModelEntry["inferenceRegion"] = null,
): AgentProviderOptions {
  if (!agentServingProviderUsesGateway(servingProvider)) return { openai: {} };

  return {
    gateway: {
      only: [servingProvider],
      ...(inferenceRegion ? { inferenceRegion: { scope: "zone" as const, geoRegion: inferenceRegion } } : {}),
      zeroDataRetention: true,
      disallowPromptTraining: true,
      caching: "auto" as const,
    },
    openai: {
      parallelToolCalls: false,
      store: false,
    },
  };
}
