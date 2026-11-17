import type { AgentProviderKeyRepo } from "./agent-provider-key.repo";
import type { AgentProviderKeyWrite, SealedAgentProviderKey, StoredAgentProviderKey } from "./agent-provider-key.repo";
import type { AgentProviderId } from "./agent-provider-models";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const KEY_SELECT = {
  id: true,
  provider: true,
  label: true,
  keyLast4: true,
  defaultModel: true,
  validatedAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

const SEALED_SELECT = { ...KEY_SELECT, companyId: true, keyCiphertext: true } as const;

export class PrismaAgentProviderKeyRepo extends TenantRepository implements AgentProviderKeyRepo {
  findAll(): Promise<StoredAgentProviderKey[]> {
    return this.prisma.agentProviderKey.findMany({
      where: { companyId: this.companyId },
      select: KEY_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  upsert(data: AgentProviderKeyWrite): Promise<StoredAgentProviderKey> {
    return this.prisma.agentProviderKey.upsert({
      where: { companyId_provider: { companyId: this.companyId, provider: data.provider } },
      create: { ...data, companyId: this.companyId, createdById: this.user.id },
      update: {
        label: data.label,
        keyCiphertext: data.keyCiphertext,
        keyLast4: data.keyLast4,
        defaultModel: data.defaultModel,
        validatedAt: data.validatedAt,
        lastUsedAt: null,
        createdById: this.user.id,
      },
      select: KEY_SELECT,
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.prisma.agentProviderKey.deleteMany({ where: { id, companyId: this.companyId } });
    return result.count === 1;
  }

  @BypassTenantGuard
  findSealedUnscoped(companyId: string, provider: AgentProviderId): Promise<SealedAgentProviderKey | null> {
    return this.prisma.agentProviderKey.findFirst({ where: { companyId, provider }, select: SEALED_SELECT });
  }

  @BypassTenantGuard
  async touchLastUsedUnscoped(companyId: string, id: string, at: Date): Promise<void> {
    await this.prisma.agentProviderKey.updateMany({ where: { id, companyId }, data: { lastUsedAt: at } });
  }
}
