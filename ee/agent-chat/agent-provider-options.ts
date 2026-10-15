import type { AgentModelEntry } from "./model-catalog";

function gatewayRouting(servingProvider: string, inferenceRegion: AgentModelEntry["inferenceRegion"]) {
  return {
    only: [servingProvider],
    ...(inferenceRegion ? { inferenceRegion: { scope: "zone" as const, geoRegion: inferenceRegion } } : {}),
    zeroDataRetention: true,
    disallowPromptTraining: true,
  };
}

export function getAgentProviderOptions(
  servingProvider: string,
  inferenceRegion: AgentModelEntry["inferenceRegion"] = null,
) {
  return {
    gateway: {
      ...gatewayRouting(servingProvider, inferenceRegion),
      caching: "auto" as const,
    },
    openai: {
      parallelToolCalls: false,
      store: false,
    },
  };
}

export function getStructuredCallProviderOptions(
  servingProvider: string,
  inferenceRegion: AgentModelEntry["inferenceRegion"] = null,
) {
  return { gateway: gatewayRouting(servingProvider, inferenceRegion) };
}
