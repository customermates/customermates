import type {
  AgentJobClaim,
  AgentJobEnqueue,
  AgentJobFilter,
  AgentJobFinish,
  AgentJobQueueEntry,
  AgentJobRepo,
  AgentJobRunRule,
  AgentJobSweepOutcome,
  StoredAgentJob,
  StoredAgentJobSummary,
} from "./agent-job.repo";
import type { AgentRuntime } from "@/generated/prisma";

import { randomUUID } from "node:crypto";

import { AgentJobStatus, Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";

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
  startedAttempts: true,
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
  async enqueue(data: AgentJobEnqueue): Promise<StoredAgentJob> {
    const id = randomUUID();
    const { count } = await this.prisma.agentJob.createMany({
      data: [{ id, ...data, companyId: this.companyId }],
      skipDuplicates: true,
    });
    const job =
      count === 1
        ? await this.findOne(id)
        : data.idempotencyKey
          ? await this.findByIdempotencyKey(data.idempotencyKey)
          : null;
    if (!job) throw new Error("The agent job could not be enqueued");
    return job;
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<StoredAgentJob | null> {
    return this.prisma.agentJob.findFirst({
      where: { companyId: this.companyId, idempotencyKey },
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

  async findRulesOfRuns(runIds: string[]): Promise<AgentJobRunRule[]> {
    if (runIds.length === 0) return [];
    const runs = await this.prisma.automationRuleRun.findMany({
      where: { id: { in: runIds }, companyId: this.companyId },
      select: { id: true, rule: { select: { id: true, name: true, ownerUserId: true } } },
    });
    return runs.map((run) => ({
      runId: run.id,
      ruleId: run.rule.id,
      name: run.rule.name,
      ownerUserId: run.rule.ownerUserId,
    }));
  }

  @BypassTenantGuard
  findUnscoped(companyId: string, id: string): Promise<StoredAgentJob | null> {
    return this.prisma.agentJob.findFirst({ where: { id, companyId }, select: JOB_SELECT });
  }

  @BypassTenantGuard
  claimUnscoped(claim: AgentJobClaim): Promise<StoredAgentJob | null> {
    if (claim.hostedLimit === undefined) return this.claim(claim);
    return runInTransaction(
      async () => {
        const lock = `customermates:agent-job-claim:${claim.companyId}`;
        await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
        return this.claim(claim);
      },
      { lockCompany: false },
    );
  }

  private async claim(claim: AgentJobClaim): Promise<StoredAgentJob | null> {
    const jobId = claim.jobId ?? null;
    const runnerId = claim.runnerId ?? null;
    const hostedLimit = claim.hostedLimit ?? null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH claimable AS MATERIALIZED (
        SELECT j."id" FROM "AgentJob" j
        WHERE j."companyId" = ${claim.companyId}
          AND j."runtime" = ${claim.runtime}::"AgentRuntime"
          AND j."status" = 'queued'
          AND (${jobId}::text IS NULL OR j."id" = ${jobId})
          AND (${runnerId}::text IS NULL OR j."pinnedRunnerId" IS NULL OR j."pinnedRunnerId" = ${runnerId})
          AND (
            ${hostedLimit}::int IS NULL
            OR (
              SELECT count(*) FROM "AgentJob" live
              WHERE live."companyId" = ${claim.companyId}
                AND live."runtime" IN ('mate', 'ownKey')
                AND live."status" IN ('claimed', 'running')
            ) < ${hostedLimit}::int
          )
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
      where: {
        id: args.id,
        companyId: args.companyId,
        status: AgentJobStatus.claimed,
        startedAttempts: 0,
        ...attemptFence(args.attempt),
      },
      data: {
        status: AgentJobStatus.running,
        startedAt: args.now,
        timeoutAt: args.timeoutAt,
        startedAttempts: { increment: 1 },
      },
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
  async releaseRunnerClaimUnscoped(args: {
    companyId: string;
    jobId: string;
    runnerId: string;
    attempt: number;
  }): Promise<boolean> {
    const { count } = await this.prisma.agentJob.updateMany({
      where: {
        id: args.jobId,
        companyId: args.companyId,
        runtime: "runner",
        status: AgentJobStatus.claimed,
        runnerId: args.runnerId,
        attempts: args.attempt,
      },
      data: { status: AgentJobStatus.queued, runnerId: null, claimedAt: null, timeoutAt: null },
    });
    return count === 1;
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
  async sweepTimeoutsUnscoped(args: { now: Date; limit: number }): Promise<AgentJobSweepOutcome[]> {
    const expired = await this.prisma.agentJob.findMany({
      where: { status: { in: LIVE_STATUSES }, timeoutAt: { lt: args.now } },
      select: {
        id: true,
        companyId: true,
        ownerUserId: true,
        runtime: true,
        attempts: true,
        startedAttempts: true,
        status: true,
      },
      orderBy: { timeoutAt: "asc" },
      take: args.limit,
    });
    const outcomes: AgentJobSweepOutcome[] = [];
    for (const { status, startedAttempts, ...job } of expired) {
      const started = status === AgentJobStatus.running || startedAttempts > 0;
      const result = await this.prisma.agentJob.updateMany({
        where: { id: job.id, companyId: job.companyId, status, startedAttempts, timeoutAt: { lt: args.now } },
        data: started
          ? { status: AgentJobStatus.timedOut, finishedAt: args.now, timeoutAt: null, error: "timedOut" }
          : { status: AgentJobStatus.queued, runnerId: null, claimedAt: null, timeoutAt: null },
      });
      if (result.count === 1) outcomes.push({ ...job, started, requeued: !started });
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
  async cancelQueuedOfInactiveRulesUnscoped(args: { now: Date; limit: number }): Promise<number> {
    const queued = await this.prisma.agentJob.findMany({
      where: {
        status: AgentJobStatus.queued,
        sourceKind: AGENT_JOB_SOURCE_AUTOMATION,
        ruleChain: { isEmpty: false },
      },
      select: { id: true, companyId: true, ruleChain: true },
      orderBy: { queuedAt: "asc" },
      take: args.limit,
    });
    if (queued.length === 0) return 0;
    const ruleOf = (job: { ruleChain: string[] }) => job.ruleChain[job.ruleChain.length - 1];
    const enabled = await this.prisma.automationRule.findMany({
      where: { id: { in: [...new Set(queued.map(ruleOf))] }, enabled: true },
      select: { id: true, companyId: true },
    });
    const live = new Set(enabled.map((rule) => `${rule.companyId}:${rule.id}`));
    const orphaned = queued.filter((job) => !live.has(`${job.companyId}:${ruleOf(job)}`)).map((job) => job.id);
    if (orphaned.length === 0) return 0;
    const { count } = await this.prisma.agentJob.updateMany({
      where: { id: { in: orphaned }, status: AgentJobStatus.queued },
      data: { status: AgentJobStatus.cancelled, finishedAt: args.now, error: AGENT_JOB_ERROR_RULE_INACTIVE },
    });
    return count;
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
  findOldestQueuedUnscoped(args: {
    companyId: string;
    runtimes: readonly AgentRuntime[];
  }): Promise<AgentJobQueueEntry | null> {
    return this.prisma.agentJob.findFirst({
      where: { companyId: args.companyId, status: AgentJobStatus.queued, runtime: { in: [...args.runtimes] } },
      select: { id: true, companyId: true, ownerUserId: true, runtime: true },
      orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
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
