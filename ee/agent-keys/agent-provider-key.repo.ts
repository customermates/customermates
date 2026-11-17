import type { AgentProviderId } from "./agent-provider-models";

export type StoredAgentProviderKey = {
  id: string;
  provider: AgentProviderId;
  label: string;
  keyLast4: string;
  defaultModel: string | null;
  validatedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type SealedAgentProviderKey = StoredAgentProviderKey & {
  companyId: string;
  keyCiphertext: string;
};

export type AgentProviderKeyWrite = {
  provider: AgentProviderId;
  label: string;
  keyCiphertext: string;
  keyLast4: string;
  defaultModel: string | null;
  validatedAt: Date;
};

export abstract class AgentProviderKeyRepo {
  abstract findAll(): Promise<StoredAgentProviderKey[]>;
  abstract upsert(data: AgentProviderKeyWrite): Promise<StoredAgentProviderKey>;
  abstract delete(id: string): Promise<boolean>;
  abstract findSealed(id: string): Promise<SealedAgentProviderKey | null>;
  abstract markValidated(id: string, at: Date): Promise<StoredAgentProviderKey | null>;
  abstract findSealedUnscoped(companyId: string, provider: AgentProviderId): Promise<SealedAgentProviderKey | null>;
  abstract touchLastUsedUnscoped(companyId: string, id: string, at: Date): Promise<void>;
}
