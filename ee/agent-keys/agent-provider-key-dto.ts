import type { StoredAgentProviderKey } from "./agent-provider-key.repo";
import type { AgentProviderKeyDto } from "./agent-provider-key.schema";

export function toAgentProviderKeyDto(row: StoredAgentProviderKey): AgentProviderKeyDto {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    last4: row.keyLast4,
    defaultModel: row.defaultModel,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
