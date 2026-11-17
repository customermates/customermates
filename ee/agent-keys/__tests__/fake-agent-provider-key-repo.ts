import type {
  AgentProviderKeyRepo,
  AgentProviderKeyWrite,
  SealedAgentProviderKey,
  StoredAgentProviderKey,
} from "../agent-provider-key.repo";
import type { AgentProviderId } from "../agent-provider-models";

export class FakeAgentProviderKeyRepo implements AgentProviderKeyRepo {
  readonly rows = new Map<string, SealedAgentProviderKey>();
  private sequence = 0;

  constructor(private readonly companyId = "00000000-0000-4000-8000-000000000011") {}

  findAll(): Promise<StoredAgentProviderKey[]> {
    return Promise.resolve([...this.rows.values()].map((row) => this.visible(row)));
  }

  private visible(row: SealedAgentProviderKey): StoredAgentProviderKey {
    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      keyLast4: row.keyLast4,
      defaultModel: row.defaultModel,
      validatedAt: row.validatedAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    };
  }

  upsert(data: AgentProviderKeyWrite): Promise<StoredAgentProviderKey> {
    const existing = [...this.rows.values()].find((row) => row.provider === data.provider);
    const id = existing?.id ?? `00000000-0000-4000-8000-00000000f${String(++this.sequence).padStart(3, "0")}`;
    const row: SealedAgentProviderKey = {
      id,
      companyId: this.companyId,
      provider: data.provider,
      label: data.label,
      keyCiphertext: data.keyCiphertext,
      keyLast4: data.keyLast4,
      defaultModel: data.defaultModel,
      validatedAt: data.validatedAt,
      lastUsedAt: null,
      createdAt: existing?.createdAt ?? new Date("2026-11-17T08:00:00.000Z"),
    };
    this.rows.set(id, row);
    return Promise.resolve(this.visible(row));
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.rows.delete(id));
  }

  findSealed(id: string): Promise<SealedAgentProviderKey | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.companyId === this.companyId ? row : null);
  }

  markValidated(id: string, at: Date): Promise<StoredAgentProviderKey | null> {
    const row = this.rows.get(id);
    if (!row || row.companyId !== this.companyId) return Promise.resolve(null);
    const next = { ...row, validatedAt: at };
    this.rows.set(id, next);
    return Promise.resolve(this.visible(next));
  }

  findSealedUnscoped(companyId: string, provider: AgentProviderId): Promise<SealedAgentProviderKey | null> {
    return Promise.resolve(
      [...this.rows.values()].find((row) => row.companyId === companyId && row.provider === provider) ?? null,
    );
  }

  touchLastUsedUnscoped(_companyId: string, id: string, at: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, lastUsedAt: at });
    return Promise.resolve();
  }
}
