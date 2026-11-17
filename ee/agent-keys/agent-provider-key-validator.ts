import type { AgentProviderId } from "./agent-provider-models";

export type AgentProviderKeyCheck = "valid" | "invalid" | "unreachable";

export type AgentProviderKeyValidator = {
  check(provider: AgentProviderId, apiKey: string): Promise<AgentProviderKeyCheck>;
};
