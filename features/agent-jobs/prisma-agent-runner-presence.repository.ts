import type { AgentRunnerPresence, AgentRunnerPresenceRepo } from "./agent-runner-presence.repo";

import { TenantRepository } from "@/core/base/tenant-repository";

export class PrismaAgentRunnerPresenceRepo extends TenantRepository implements AgentRunnerPresenceRepo {
  findActive(): Promise<AgentRunnerPresence[]> {
    return this.prisma.agentRunner.findMany({
      where: { companyId: this.companyId, revokedAt: null },
      select: { id: true, name: true, lastSeenAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }
}
