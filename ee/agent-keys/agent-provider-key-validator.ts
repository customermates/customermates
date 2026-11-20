import type { AgentProviderId } from "./agent-provider-models";

export type AgentProviderKeyCheck = "valid" | "invalid" | "unverified" | "unreachable";

export type AgentProviderKeyValidator = {
  check(provider: AgentProviderId, apiKey: string): Promise<AgentProviderKeyCheck>;
};
