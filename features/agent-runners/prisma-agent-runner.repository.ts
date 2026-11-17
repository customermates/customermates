import type {
  AgentRunnerHeartbeat,
  AgentRunnerLiveJob,
  AgentRunnerLookup,
  AgentRunnerRepo,
  AgentRunnerWaitingOwner,
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
  createdById: true,
  createdAt: true,
} as const;

const LIVE_STATUSES = [AgentJobStatus.claimed, AgentJobStatus.running];

function ownerKey(companyId: string, userId: string): string {
  return `${companyId}:${userId}`;
}

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

  findRunner(id: string): Promise<Pick<StoredAgentRunner, "id" | "revokedAt"> | null> {
    return this.prisma.agentRunner.findFirst({
      where: { id, companyId: this.companyId },
      select: { id: true, revokedAt: true },
    });
  }

  @BypassTenantGuard
  async revokeRunnerUnscoped(args: { companyId: string; id: string; at: Date }): Promise<boolean> {
    const { count } = await this.prisma.agentRunner.updateMany({
      where: { id: args.id, companyId: args.companyId, revokedAt: null },
      data: { revokedAt: args.at },
    });
    return count === 1;
  }

  @BypassTenantGuard
  async findUnrevokedRunnerIdsOfUnscoped(args: { companyId: string; createdById: string }): Promise<string[]> {
    const runners = await this.prisma.agentRunner.findMany({
      where: { companyId: args.companyId, createdById: args.createdById, revokedAt: null },
      select: { id: true },
    });
    return runners.map((runner) => runner.id);
  }

  @BypassTenantGuard
  findRunnerByTokenHashUnscoped(tokenHash: string): Promise<AgentRunnerLookup | null> {
    return this.prisma.agentRunner.findUnique({
      where: { tokenHash },
      select: {
        ...RUNNER_SELECT,
        companyId: true,
        company: { select: { deletingAt: true } },
        createdBy: { select: { status: true } },
      },
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
  async findClaimableJobIdsUnscoped(args: {
    companyId: string;
    ownerUserId: string;
    runnerId: string;
    limit: number;
  }): Promise<string[]> {
    const jobs = await this.prisma.agentJob.findMany({
      where: {
        companyId: args.companyId,
        runtime: AgentRuntime.runner,
        status: AgentJobStatus.queued,
        ownerUserId: args.ownerUserId,
        OR: [{ pinnedRunnerId: null }, { pinnedRunnerId: args.runnerId }],
      },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: args.limit,
    });
    return jobs.map((job) => job.id);
  }

  @BypassTenantGuard
  findLiveJobsOfRunnerUnscoped(args: { companyId: string; runnerId: string }): Promise<AgentRunnerLiveJob[]> {
    return this.prisma.agentJob.findMany({
      where: { companyId: args.companyId, runnerId: args.runnerId, status: { in: LIVE_STATUSES } },
      select: { id: true, attempts: true },
    });
  }

  @BypassTenantGuard
  async releaseClaimedJobUnscoped(args: {
    companyId: string;
    jobId: string;
    runnerId: string;
    attempt: number;
  }): Promise<boolean> {
    const { count } = await this.prisma.agentJob.updateMany({
      where: {
        id: args.jobId,
        companyId: args.companyId,
        runtime: AgentRuntime.runner,
        status: AgentJobStatus.claimed,
        runnerId: args.runnerId,
        attempts: args.attempt,
      },
      data: { status: AgentJobStatus.queued, runnerId: null, claimedAt: null, timeoutAt: null },
    });
    return count === 1;
  }

  @BypassTenantGuard
  async findWaitingOwnersUnscoped(args: { seenSince: Date }): Promise<AgentRunnerWaitingOwner[]> {
    const queued = await this.prisma.agentJob.findMany({
      where: {
        runtime: AgentRuntime.runner,
        status: AgentJobStatus.queued,
        company: { deletingAt: null },
        owner: { status: Status.active },
      },
      select: {
        companyId: true,
        ownerUserId: true,
        pinnedRunnerId: true,
        owner: { select: { displayLanguage: true } },
      },
      distinct: ["companyId", "ownerUserId", "pinnedRunnerId"],
    });
    if (queued.length === 0) return [];
    const runners = await this.prisma.agentRunner.findMany({
      where: {
        companyId: { in: [...new Set(queued.map((job) => job.companyId))] },
        createdById: { in: [...new Set(queued.map((job) => job.ownerUserId))] },
        revokedAt: null,
      },
      select: { id: true, companyId: true, createdById: true, lastSeenAt: true },
    });
    const ownRunners = new Map<string, typeof runners>();
    for (const runner of runners) {
      const key = ownerKey(runner.companyId, runner.createdById);
      ownRunners.set(key, [...(ownRunners.get(key) ?? []), runner]);
    }
    const waiting = new Map<string, AgentRunnerWaitingOwner>();
    for (const job of queued) {
      const key = ownerKey(job.companyId, job.ownerUserId);
      const own = ownRunners.get(key) ?? [];
      const able = own.filter((runner) => job.pinnedRunnerId === null || runner.id === job.pinnedRunnerId);
      if (able.some((runner) => runner.lastSeenAt !== null && runner.lastSeenAt >= args.seenSince)) continue;
      const seen = able.flatMap((runner) => (runner.lastSeenAt ? [runner.lastSeenAt.getTime()] : []));
      const lastSeenAt = seen.length > 0 ? new Date(Math.max(...seen)) : null;
      const known = waiting.get(key);
      if (known && (known.lastSeenAt?.getTime() ?? 0) >= (lastSeenAt?.getTime() ?? 0)) continue;
      waiting.set(key, {
        companyId: job.companyId,
        userId: job.ownerUserId,
        displayLanguage: job.owner.displayLanguage,
        lastSeenAt,
      });
    }
    return [...waiting.values()];
  }
}
