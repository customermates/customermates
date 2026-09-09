import { AGENT_WEB_SEARCH_MAX_TOOL_CALLS_PER_ROUND } from "./agent-web-search";

export const AGENT_SERVING_PROVIDER = "azure";

export function getAgentProviderOptions(servingProvider: string) {
  if (servingProvider !== AGENT_SERVING_PROVIDER) throw new Error("Hosted Assistant requires Azure.");

  return {
    gateway: {
      only: [servingProvider],
      zeroDataRetention: true,
      disallowPromptTraining: true,
    },
    openai: {
      parallelToolCalls: false,
      store: false,
      maxToolCalls: AGENT_WEB_SEARCH_MAX_TOOL_CALLS_PER_ROUND,
    },
  };
}
