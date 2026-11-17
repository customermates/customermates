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
} from "../agent-job.repo";
import type { AgentRuntime } from "@/generated/prisma";

const COMPANY = "00000000-0000-4000-8000-000000000011";

export class FakeAgentJobRepo implements AgentJobRepo {
  readonly jobs = new Map<string, StoredAgentJob>();
  readonly events = new Map<string, unknown[]>();
  readonly inactiveRuleIds = new Set<string>();
  private readonly keys = new Map<string, string>();
  private sequence = 0;

  constructor(private readonly companyId = COMPANY) {}

  add(overrides: Partial<StoredAgentJob> = {}): StoredAgentJob {
    this.sequence += 1;
    const job: StoredAgentJob = {
      id: `00000000-0000-4000-8000-0000000b${String(this.sequence).padStart(4, "0")}`,
      companyId: this.companyId,
      runtime: "ownKey",
      status: "queued",
      sourceKind: "automation",
      sourceId: null,
      ruleChain: [],
      ownerUserId: "00000000-0000-4000-8000-000000000010",
      prompt: "Do the thing",
      promptUntrusted: false,
      model: null,
      pinnedRunnerId: null,
      runnerId: null,
      attempts: 0,
      queuedAt: new Date(Date.UTC(2026, 10, 17, 8, 0, this.sequence)),
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      timeoutAt: null,
      result: null,
      transcript: null,
      inputTokens: null,
      outputTokens: null,
      costMicrocents: null,
      error: null,
      createdAt: new Date(Date.UTC(2026, 10, 17, 8, 0, this.sequence)),
      ...overrides,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async enqueue({ idempotencyKey, ...data }: AgentJobEnqueue): Promise<StoredAgentJob> {
    const existing = idempotencyKey ? await this.findByIdempotencyKey(idempotencyKey) : null;
    if (existing) return existing;
    const job = this.add(data);
    if (idempotencyKey) this.keys.set(idempotencyKey, job.id);
    return job;
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<StoredAgentJob | null> {
    return Promise.resolve(this.jobs.get(this.keys.get(idempotencyKey) ?? "") ?? null);
  }

  findPage(filter: AgentJobFilter): Promise<StoredAgentJobSummary[]> {
    const rows = [...this.jobs.values()]
      .filter((job) => job.companyId === this.companyId)
      .filter((job) => !filter.ownerUserId || job.ownerUserId === filter.ownerUserId)
      .filter((job) => !filter.status?.length || filter.status.includes(job.status))
      .filter((job) => !filter.sourceKind || job.sourceKind === filter.sourceKind)
      .filter((job) => !filter.sourceId || job.sourceId === filter.sourceId)
      .filter(
        (job) =>
          !filter.cursor ||
          job.createdAt < filter.cursor.createdAt ||
          (job.createdAt.getTime() === filter.cursor.createdAt.getTime() && job.id < filter.cursor.id),
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || (right.id < left.id ? -1 : 1));
    return Promise.resolve(rows.slice(0, filter.limit));
  }

  findOne(id: string): Promise<StoredAgentJob | null> {
    const job = this.jobs.get(id);
    return Promise.resolve(job && job.companyId === this.companyId ? job : null);
  }

  findUnscoped(companyId: string, id: string): Promise<StoredAgentJob | null> {
    const job = this.jobs.get(id);
    return Promise.resolve(job && job.companyId === companyId ? job : null);
  }

  claimUnscoped(claim: AgentJobClaim): Promise<StoredAgentJob | null> {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        candidate.companyId === claim.companyId &&
        candidate.runtime === claim.runtime &&
        candidate.status === "queued" &&
        (!claim.jobId || candidate.id === claim.jobId) &&
        (!claim.runnerId || !candidate.pinnedRunnerId || candidate.pinnedRunnerId === claim.runnerId),
    );
    if (!job) return Promise.resolve(null);
    const claimed = {
      ...job,
      status: "claimed" as const,
      runnerId: claim.runnerId ?? null,
      claimedAt: claim.now,
      timeoutAt: claim.timeoutAt,
      attempts: job.attempts + 1,
    };
    this.jobs.set(job.id, claimed);
    return Promise.resolve(claimed);
  }

  private live(args: { id: string; companyId: string; attempt?: number }): StoredAgentJob | null {
    const job = this.jobs.get(args.id);
    if (!job || job.companyId !== args.companyId || !["claimed", "running"].includes(job.status)) return null;
    return args.attempt === undefined || job.attempts === args.attempt ? job : null;
  }

  startUnscoped(args: { id: string; companyId: string; attempt?: number }): Promise<boolean> {
    const job = this.live(args);
    if (!job || job.status !== "claimed") return Promise.resolve(false);
    this.jobs.set(job.id, { ...job, status: "running" });
    return Promise.resolve(true);
  }

  appendEventsUnscoped(args: { id: string; companyId: string; attempt?: number; events: unknown[] }): Promise<boolean> {
    if (!this.live(args)) return Promise.resolve(false);
    this.events.set(args.id, [...(this.events.get(args.id) ?? []), ...args.events]);
    return Promise.resolve(true);
  }

  finishUnscoped(args: AgentJobFinish): Promise<boolean> {
    const job = this.live(args);
    if (!job) return Promise.resolve(false);
    this.jobs.set(job.id, {
      ...job,
      status: args.status,
      finishedAt: args.now,
      result: args.result as StoredAgentJob["result"],
      error: args.error,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costMicrocents: args.costMicrocents === null ? null : BigInt(args.costMicrocents),
      timeoutAt: null,
      transcript: (this.events.get(job.id) ?? null) as StoredAgentJob["transcript"],
    });
    return Promise.resolve(true);
  }

  discardQueuedUnscoped(args: { id: string; companyId: string; error: string; now: Date }): Promise<boolean> {
    const job = this.jobs.get(args.id);
    if (!job || job.companyId !== args.companyId || job.status !== "queued") return Promise.resolve(false);
    this.jobs.set(job.id, { ...job, status: "failed", error: args.error, finishedAt: args.now });
    return Promise.resolve(true);
  }

  sweepTimeoutsUnscoped(args: { now: Date; maxAttempts: number }): Promise<AgentJobSweepOutcome[]> {
    const outcomes: AgentJobSweepOutcome[] = [];
    for (const job of this.jobs.values()) {
      if (!["claimed", "running"].includes(job.status) || !job.timeoutAt || job.timeoutAt >= args.now) continue;
      const requeued = job.attempts < args.maxAttempts;
      this.jobs.set(
        job.id,
        requeued
          ? { ...job, status: "queued", queuedAt: args.now, runnerId: null, timeoutAt: null }
          : { ...job, status: "timedOut", timeoutAt: null },
      );
      outcomes.push({
        id: job.id,
        companyId: job.companyId,
        ownerUserId: job.ownerUserId,
        runtime: job.runtime,
        attempts: job.attempts,
        requeued,
      });
    }
    return Promise.resolve(outcomes);
  }

  findStaleQueuedUnscoped(args: {
    runtimes: readonly AgentRuntime[];
    queuedBefore: Date;
    limit: number;
  }): Promise<AgentJobQueueEntry[]> {
    const stale = [...this.jobs.values()]
      .filter((job) => job.status === "queued" && args.runtimes.includes(job.runtime))
      .filter((job) => job.queuedAt < args.queuedBefore)
      .slice(0, args.limit)
      .map(({ id, companyId, ownerUserId, runtime }) => ({ id, companyId, ownerUserId, runtime }));
    return Promise.resolve(stale);
  }

  private close(
    matches: (job: StoredAgentJob) => boolean,
    patch: Pick<StoredAgentJob, "status" | "error" | "finishedAt">,
    limit = Number.POSITIVE_INFINITY,
  ): Promise<number> {
    const closing = [...this.jobs.values()].filter(matches).slice(0, limit);
    for (const job of closing) this.jobs.set(job.id, { ...job, ...patch, timeoutAt: null });
    return Promise.resolve(closing.length);
  }

  expireQueuedUnscoped(args: { queuedBefore: Date; now: Date; limit: number }): Promise<number> {
    return this.close(
      (job) => job.status === "queued" && job.queuedAt < args.queuedBefore,
      { status: "timedOut", error: "queueExpired", finishedAt: args.now },
      args.limit,
    );
  }

  cancelForRunnerUnscoped(args: { companyId: string; runnerId: string; now: Date }): Promise<number> {
    return this.close(
      (job) =>
        job.companyId === args.companyId &&
        ((job.status === "queued" && job.pinnedRunnerId === args.runnerId) ||
          (["claimed", "running"].includes(job.status) && job.runnerId === args.runnerId)),
      { status: "cancelled", error: "runnerRevoked", finishedAt: args.now },
    );
  }

  cancelQueuedForRuleUnscoped(args: { companyId: string; ruleId: string; now: Date }): Promise<number> {
    return this.close(
      (job) =>
        job.companyId === args.companyId &&
        job.status === "queued" &&
        job.sourceKind === "automation" &&
        job.ruleChain.at(-1) === args.ruleId,
      { status: "cancelled", error: "ruleInactive", finishedAt: args.now },
    );
  }

  cancelQueuedOfInactiveRulesUnscoped(args: { now: Date; limit: number }): Promise<number> {
    return this.close(
      (job) =>
        job.status === "queued" &&
        job.sourceKind === "automation" &&
        this.inactiveRuleIds.has(job.ruleChain.at(-1) ?? ""),
      { status: "cancelled", error: "ruleInactive", finishedAt: args.now },
      args.limit,
    );
  }

  deleteFinishedBeforeUnscoped(before: Date): Promise<number> {
    let deleted = 0;
    for (const job of this.jobs.values()) {
      if (!job.finishedAt || job.finishedAt >= before) continue;
      this.jobs.delete(job.id);
      deleted += 1;
    }
    return Promise.resolve(deleted);
  }
}
