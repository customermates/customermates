import type {
  AgentRunnerHeartbeat,
  AgentRunnerLookup,
  AgentRunnerOfflineWorkspace,
  AgentRunnerRepo,
  StoredAgentRunner,
} from "./agent-runner.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { AgentRuntime, AgentJobStatus, Status } from "@/generated/prisma";

const RUNNER_SELECT = {
  id: true,
  name: true,
  machine: true,
  clients: true,
  lastSeenAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

export class PrismaAgentRunnerRepo extends TenantRepository implements AgentRunnerRepo {
  listRunners(): Promise<StoredAgentRunner[]> {
    return this.prisma.agentRunner.findMany({
      where: { companyId: this.companyId },
      select: RUNNER_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  createRunner(data: { name: string; tokenHash: string }): Promise<StoredAgentRunner> {
    return this.prisma.agentRunner.create({
      data: { companyId: this.companyId, createdById: this.userId, name: data.name, tokenHash: data.tokenHash },
      select: RUNNER_SELECT,
    });
  }

  async revokeRunner(id: string, at: Date): Promise<Date | null> {
    const runner = await this.prisma.agentRunner.findFirst({
      where: { id, companyId: this.companyId },
      select: { revokedAt: true },
    });
    if (!runner) return null;
    if (runner.revokedAt) return runner.revokedAt;
    await this.prisma.agentRunner.updateMany({
      where: { id, companyId: this.companyId, revokedAt: null },
      data: { revokedAt: at },
    });
    return at;
  }

  @BypassTenantGuard
  findRunnerByTokenHashUnscoped(tokenHash: string): Promise<AgentRunnerLookup | null> {
    return this.prisma.agentRunner.findUnique({
      where: { tokenHash },
      select: { ...RUNNER_SELECT, companyId: true, company: { select: { deletingAt: true } } },
    });
  }

  @BypassTenantGuard
  async recordHeartbeatUnscoped(id: string, heartbeat: AgentRunnerHeartbeat): Promise<void> {
    await this.prisma.agentRunner.updateMany({
      where: { id, revokedAt: null },
      data: {
        lastSeenAt: heartbeat.at,
        clients: heartbeat.clients,
        ...(heartbeat.machine === undefined ? {} : { machine: heartbeat.machine }),
      },
    });
  }

  @BypassTenantGuard
  async touchRunnerUnscoped(id: string, at: Date): Promise<void> {
    await this.prisma.agentRunner.updateMany({ where: { id, revokedAt: null }, data: { lastSeenAt: at } });
  }

  @BypassTenantGuard
  async findOfflineWorkspacesUnscoped(args: { seenSince: Date }): Promise<AgentRunnerOfflineWorkspace[]> {
    const queued = await this.prisma.agentJob.findMany({
      where: {
        runtime: AgentRuntime.runner,
        status: AgentJobStatus.queued,
        company: { deletingAt: null },
        owner: { status: Status.active },
      },
      select: { companyId: true, ownerUserId: true, owner: { select: { displayLanguage: true } } },
      distinct: ["companyId", "ownerUserId"],
    });
    if (queued.length === 0) return [];
    const online = await this.prisma.agentRunner.findMany({
      where: {
        companyId: { in: [...new Set(queued.map((job) => job.companyId))] },
        revokedAt: null,
        lastSeenAt: { gte: args.seenSince },
      },
      select: { companyId: true },
      distinct: ["companyId"],
    });
    const onlineCompanies = new Set(online.map((runner) => runner.companyId));
    const byCompany = new Map<string, AgentRunnerOfflineWorkspace>();
    for (const job of queued) {
      if (onlineCompanies.has(job.companyId)) continue;
      const workspace = byCompany.get(job.companyId) ?? { companyId: job.companyId, owners: [] };
      workspace.owners.push({ userId: job.ownerUserId, displayLanguage: job.owner.displayLanguage });
      byCompany.set(job.companyId, workspace);
    }
    return [...byCompany.values()];
  }
}
