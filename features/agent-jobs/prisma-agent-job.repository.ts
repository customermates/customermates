import type {
  AgentJobClaim,
  AgentJobEnqueue,
  AgentJobFilter,
  AgentJobFinish,
  AgentJobQueueEntry,
  AgentJobRepo,
  AgentJobSweepOutcome,
  StoredAgentJob,
  StoredAgentJobSummary,
} from "./agent-job.repo";
import type { AgentRuntime } from "@/generated/prisma";

import { AgentJobStatus, Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

import {
  AGENT_JOB_ERROR_QUEUE_EXPIRED,
  AGENT_JOB_ERROR_RULE_INACTIVE,
  AGENT_JOB_ERROR_RUNNER_REVOKED,
  AGENT_JOB_SOURCE_AUTOMATION,
} from "./agent-job.schema";

const JOB_LIST_SELECT = {
  id: true,
  companyId: true,
  runtime: true,
  status: true,
  sourceKind: true,
  sourceId: true,
  ruleChain: true,
  ownerUserId: true,
  model: true,
  pinnedRunnerId: true,
  runnerId: true,
  attempts: true,
  queuedAt: true,
  claimedAt: true,
  startedAt: true,
  finishedAt: true,
  timeoutAt: true,
  result: true,
  inputTokens: true,
  outputTokens: true,
  costMicrocents: true,
  error: true,
  createdAt: true,
} as const;

const JOB_SELECT = { ...JOB_LIST_SELECT, prompt: true, promptUntrusted: true, transcript: true } as const;

const LIVE_STATUSES = [AgentJobStatus.claimed, AgentJobStatus.running];
const FINISHED_STATUSES = [
  AgentJobStatus.succeeded,
  AgentJobStatus.failed,
  AgentJobStatus.timedOut,
  AgentJobStatus.cancelled,
];

function attemptFence(attempt: number | undefined): { attempts?: number } {
  return attempt === undefined ? {} : { attempts: attempt };
}

export class PrismaAgentJobRepo extends TenantRepository implements AgentJobRepo {
  enqueue(data: AgentJobEnqueue): Promise<StoredAgentJob> {
    return this.prisma.agentJob.create({
      data: { ...data, companyId: this.companyId },
      select: JOB_SELECT,
    });
  }

  findPage(filter: AgentJobFilter): Promise<StoredAgentJobSummary[]> {
    const { cursor } = filter;
    return this.prisma.agentJob.findMany({
      where: {
        companyId: this.companyId,
        ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
        ...(filter.status?.length ? { status: { in: filter.status } } : {}),
        ...(filter.sourceKind ? { sourceKind: filter.sourceKind } : {}),
        ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {}),
      },
      select: JOB_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.limit,
    });
  }

  findOne(id: string): Promise<StoredAgentJob | null> {
    return this.prisma.agentJob.findFirst({ where: { id, companyId: this.companyId }, select: JOB_SELECT });
  }

  @BypassTenantGuard
  findUnscoped(companyId: string, id: string): Promise<StoredAgentJob | null> {
    return this.prisma.agentJob.findFirst({ where: { id, companyId }, select: JOB_SELECT });
  }

  @BypassTenantGuard
  async claimUnscoped(claim: AgentJobClaim): Promise<StoredAgentJob | null> {
    const jobId = claim.jobId ?? null;
    const runnerId = claim.runnerId ?? null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH claimable AS MATERIALIZED (
        SELECT j."id" FROM "AgentJob" j
        WHERE j."companyId" = ${claim.companyId}
          AND j."runtime" = ${claim.runtime}::"AgentRuntime"
          AND j."status" = 'queued'
          AND (${jobId}::text IS NULL OR j."id" = ${jobId})
          AND (${runnerId}::text IS NULL OR j."pinnedRunnerId" IS NULL OR j."pinnedRunnerId" = ${runnerId})
        ORDER BY j."createdAt" ASC, j."id" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "AgentJob" job SET
        "status" = 'claimed',
        "claimedAt" = ${claim.now},
        "timeoutAt" = ${claim.timeoutAt},
        "attempts" = job."attempts" + 1,
        "runnerId" = ${runnerId},
        "updatedAt" = ${claim.now}
      FROM claimable c
      WHERE job."id" = c."id" AND job."companyId" = ${claim.companyId}
      RETURNING job."id"
    `);
    const claimed = rows[0];
    return claimed ? this.findUnscoped(claim.companyId, claimed.id) : null;
  }

  @BypassTenantGuard
  async startUnscoped(args: {
    id: string;
    companyId: string;
    attempt?: number;
    now: Date;
    timeoutAt: Date;
  }): Promise<boolean> {
    const result = await this.prisma.agentJob.updateMany({
      where: { id: args.id, companyId: args.companyId, status: AgentJobStatus.claimed, ...attemptFence(args.attempt) },
      data: { status: AgentJobStatus.running, startedAt: args.now, timeoutAt: args.timeoutAt },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async appendEventsUnscoped(args: {
    id: string;
    companyId: string;
    attempt?: number;
    events: Prisma.InputJsonValue[];
    maxEvents: number;
  }): Promise<boolean> {
    if (args.events.length === 0) {
      const live = await this.prisma.agentJob.count({
        where: {
          id: args.id,
          companyId: args.companyId,
          status: { in: LIVE_STATUSES },
          ...attemptFence(args.attempt),
        },
      });
      return live === 1;
    }
    const attempt = args.attempt ?? null;
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "AgentJob" job SET
        "transcript" = (
          SELECT COALESCE(jsonb_agg(kept."value" ORDER BY kept."position"), '[]'::jsonb)
          FROM (
            SELECT entry."value", entry."position"
            FROM jsonb_array_elements(
              (CASE WHEN jsonb_typeof(job."transcript") = 'array' THEN job."transcript" ELSE '[]'::jsonb END)
              || ${JSON.stringify(args.events)}::jsonb
            ) WITH ORDINALITY AS entry("value", "position")
            ORDER BY entry."position" DESC
            LIMIT ${args.maxEvents}::int
          ) kept
        ),
        "updatedAt" = NOW()
      WHERE job."id" = ${args.id}
        AND job."companyId" = ${args.companyId}
        AND job."status" IN ('claimed', 'running')
        AND (${attempt}::int IS NULL OR job."attempts" = ${attempt}::int)
    `);
    return updated === 1;
  }

  @BypassTenantGuard
  async finishUnscoped(args: AgentJobFinish): Promise<boolean> {
    const result = await this.prisma.agentJob.updateMany({
      where: {
        id: args.id,
        companyId: args.companyId,
        status: { in: LIVE_STATUSES },
        ...attemptFence(args.attempt),
      },
      data: {
        status: args.status,
        finishedAt: args.now,
        result: args.result ?? Prisma.JsonNull,
        error: args.error,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        costMicrocents: args.costMicrocents === null ? null : BigInt(args.costMicrocents),
        timeoutAt: null,
      },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async discardQueuedUnscoped(args: { id: string; companyId: string; error: string; now: Date }): Promise<boolean> {
    const result = await this.prisma.agentJob.updateMany({
      where: { id: args.id, companyId: args.companyId, status: AgentJobStatus.queued },
      data: { status: AgentJobStatus.failed, finishedAt: args.now, error: args.error },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async sweepTimeoutsUnscoped(args: {
    now: Date;
    maxAttempts: number;
    limit: number;
  }): Promise<AgentJobSweepOutcome[]> {
    const expired = await this.prisma.agentJob.findMany({
      where: { status: { in: LIVE_STATUSES }, timeoutAt: { lt: args.now } },
      select: { id: true, companyId: true, ownerUserId: true, runtime: true, attempts: true },
      orderBy: { timeoutAt: "asc" },
      take: args.limit,
    });
    const outcomes: AgentJobSweepOutcome[] = [];
    for (const job of expired) {
      const requeue = job.attempts < args.maxAttempts;
      const result = await this.prisma.agentJob.updateMany({
        where: { id: job.id, companyId: job.companyId, status: { in: LIVE_STATUSES }, timeoutAt: { lt: args.now } },
        data: requeue
          ? {
              status: AgentJobStatus.queued,
              queuedAt: args.now,
              runnerId: null,
              claimedAt: null,
              startedAt: null,
              timeoutAt: null,
            }
          : { status: AgentJobStatus.timedOut, finishedAt: args.now, timeoutAt: null, error: "timedOut" },
      });
      if (result.count === 1) outcomes.push({ ...job, requeued: requeue });
    }
    return outcomes;
  }

  @BypassTenantGuard
  async expireQueuedUnscoped(args: { queuedBefore: Date; now: Date; limit: number }): Promise<number> {
    const waiting = await this.prisma.agentJob.findMany({
      where: { status: AgentJobStatus.queued, queuedAt: { lt: args.queuedBefore } },
      select: { id: true },
      orderBy: { queuedAt: "asc" },
      take: args.limit,
    });
    if (waiting.length === 0) return 0;
    const { count } = await this.prisma.agentJob.updateMany({
      where: {
        id: { in: waiting.map((job) => job.id) },
        status: AgentJobStatus.queued,
        queuedAt: { lt: args.queuedBefore },
      },
      data: { status: AgentJobStatus.timedOut, finishedAt: args.now, error: AGENT_JOB_ERROR_QUEUE_EXPIRED },
    });
    return count;
  }

  @BypassTenantGuard
  async cancelForRunnerUnscoped(args: { companyId: string; runnerId: string; now: Date }): Promise<number> {
    const { count } = await this.prisma.agentJob.updateMany({
      where: {
        companyId: args.companyId,
        OR: [
          { status: AgentJobStatus.queued, pinnedRunnerId: args.runnerId },
          { status: { in: LIVE_STATUSES }, runnerId: args.runnerId },
        ],
      },
      data: {
        status: AgentJobStatus.cancelled,
        finishedAt: args.now,
        timeoutAt: null,
        error: AGENT_JOB_ERROR_RUNNER_REVOKED,
      },
    });
    return count;
  }

  @BypassTenantGuard
  cancelQueuedForRuleUnscoped(args: { companyId: string; ruleId: string; now: Date }): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "AgentJob" job SET
        "status" = 'cancelled',
        "finishedAt" = ${args.now},
        "error" = ${AGENT_JOB_ERROR_RULE_INACTIVE},
        "updatedAt" = ${args.now}
      WHERE job."companyId" = ${args.companyId}
        AND job."status" = 'queued'
        AND job."sourceKind" = ${AGENT_JOB_SOURCE_AUTOMATION}
        AND job."ruleChain"[cardinality(job."ruleChain")] = ${args.ruleId}
    `);
  }

  @BypassTenantGuard
  cancelQueuedOfInactiveRulesUnscoped(args: { now: Date; limit: number }): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      WITH orphaned AS MATERIALIZED (
        SELECT j."id" FROM "AgentJob" j
        WHERE j."status" = 'queued'
          AND j."sourceKind" = ${AGENT_JOB_SOURCE_AUTOMATION}
          AND cardinality(j."ruleChain") > 0
          AND NOT EXISTS (
            SELECT 1 FROM "AutomationRule" rule
            WHERE rule."companyId" = j."companyId"
              AND rule."id" = j."ruleChain"[cardinality(j."ruleChain")]
              AND rule."enabled"
          )
        ORDER BY j."queuedAt" ASC
        LIMIT ${args.limit}::int
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "AgentJob" job SET
        "status" = 'cancelled',
        "finishedAt" = ${args.now},
        "error" = ${AGENT_JOB_ERROR_RULE_INACTIVE},
        "updatedAt" = ${args.now}
      FROM orphaned
      WHERE job."id" = orphaned."id" AND job."status" = 'queued'
    `);
  }

  @BypassTenantGuard
  findStaleQueuedUnscoped(args: {
    runtimes: readonly AgentRuntime[];
    queuedBefore: Date;
    limit: number;
  }): Promise<AgentJobQueueEntry[]> {
    return this.prisma.agentJob.findMany({
      where: {
        status: AgentJobStatus.queued,
        runtime: { in: [...args.runtimes] },
        queuedAt: { lt: args.queuedBefore },
      },
      select: { id: true, companyId: true, ownerUserId: true, runtime: true },
      orderBy: { queuedAt: "asc" },
      take: args.limit,
    });
  }

  @BypassTenantGuard
  async deleteFinishedBeforeUnscoped(before: Date, limit: number): Promise<number> {
    const expired = await this.prisma.agentJob.findMany({
      where: { status: { in: FINISHED_STATUSES }, finishedAt: { lt: before } },
      select: { id: true },
      orderBy: { finishedAt: "asc" },
      take: limit,
    });
    const { count } = await this.prisma.agentJob.deleteMany({ where: { id: { in: expired.map((job) => job.id) } } });
    return count;
  }
}
