import type { SecretBinding } from "@/core/security/secret-box";
import type { AgentProviderId } from "./agent-provider-models";

export function agentProviderKeyBinding(companyId: string, provider: AgentProviderId): SecretBinding {
  return ["agent-provider-key", companyId, provider];
}
