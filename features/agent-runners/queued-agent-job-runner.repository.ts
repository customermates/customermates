import type { Prisma } from "@/generated/prisma";
import type { AgentJobRepo } from "@/features/agent-jobs/agent-job.repo";
import type { AgentJobCredentialRun, AgentJobRunnerState } from "./agent-job-runner.repo";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type {
  AgentJobClaim,
  AgentJobOutcome,
  AgentRunnerTranscriptEvent,
  AuthenticatedAgentRunner,
} from "./agent-runner.schema";

import { AGENT_JOB_MAX_WALL_MS, AGENT_JOB_TRANSCRIPT_MAX_EVENTS } from "@/features/agent-jobs/agent-job.schema";

import { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import { AGENT_RUNNER_LIMITS } from "./agent-runner.schema";

type Jobs = Pick<
  AgentJobRepo,
  "claimUnscoped" | "startUnscoped" | "findUnscoped" | "appendEventsUnscoped" | "finishUnscoped"
>;

export class QueuedAgentJobRunnerRepo extends AgentJobRunnerRepo {
  constructor(
    private readonly jobs: Jobs,
    private readonly runners: Pick<AgentRunnerRepo, "findClaimableJobIdsUnscoped" | "releaseClaimedJobUnscoped">,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  async claimNextForRunner(runner: AuthenticatedAgentRunner): Promise<AgentJobClaim | null> {
    const candidates = await this.runners.findClaimableJobIdsUnscoped({
      companyId: runner.companyId,
      ownerUserId: runner.createdById,
      runnerId: runner.id,
      limit: AGENT_RUNNER_LIMITS.claimCandidates,
    });
    for (const jobId of candidates) {
      const now = this.clock();
      const confirmBy = new Date(now.getTime() + AGENT_RUNNER_LIMITS.claimConfirmMs);
      const job = await this.jobs.claimUnscoped({
        companyId: runner.companyId,
        runtime: "runner",
        jobId,
        runnerId: runner.id,
        now,
        timeoutAt: confirmBy,
      });
      if (!job) continue;
      return {
        id: job.id,
        companyId: job.companyId,
        ownerUserId: job.ownerUserId,
        attempt: job.attempts,
        prompt: job.prompt,
        promptUntrusted: job.promptUntrusted,
        confirmBy,
      };
    }
    return null;
  }

  releaseClaim(jobId: string, runner: AuthenticatedAgentRunner, attempt: number): Promise<boolean> {
    return this.runners.releaseClaimedJobUnscoped({
      companyId: runner.companyId,
      jobId,
      runnerId: runner.id,
      attempt,
    });
  }

  async findForRunner(jobId: string, runner: AuthenticatedAgentRunner): Promise<AgentJobRunnerState | null> {
    const job = await this.jobs.findUnscoped(runner.companyId, jobId);
    if (!job || job.runnerId !== runner.id) return null;
    return { id: job.id, status: job.status, attempt: job.attempts, timeoutAt: job.timeoutAt };
  }

  async start(jobId: string, runner: AuthenticatedAgentRunner, attempt: number): Promise<Date | null> {
    const now = this.clock();
    const timeoutAt = new Date(now.getTime() + AGENT_JOB_MAX_WALL_MS);
    const started = await this.jobs.startUnscoped({ id: jobId, companyId: runner.companyId, attempt, now, timeoutAt });
    return started ? timeoutAt : null;
  }

  appendTranscript(
    jobId: string,
    runner: AuthenticatedAgentRunner,
    attempt: number,
    events: AgentRunnerTranscriptEvent[],
  ): Promise<boolean> {
    return this.jobs.appendEventsUnscoped({
      id: jobId,
      companyId: runner.companyId,
      attempt,
      events: events as unknown as Prisma.InputJsonValue[],
      maxEvents: AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
    });
  }

  finish(jobId: string, runner: AuthenticatedAgentRunner, attempt: number, outcome: AgentJobOutcome): Promise<boolean> {
    return this.jobs.finishUnscoped({
      id: jobId,
      companyId: runner.companyId,
      attempt,
      status: outcome.status,
      result: outcome.result,
      error: outcome.error,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costMicrocents: null,
      now: this.clock(),
    });
  }

  async findRunningAttempt(args: {
    companyId: string;
    jobId: string;
    attempt: number;
    runnerId: string;
  }): Promise<AgentJobCredentialRun | null> {
    const job = await this.jobs.findUnscoped(args.companyId, args.jobId);
    if (!job || job.runtime !== "runner" || job.status !== "running") return null;
    if (job.attempts !== args.attempt || job.runnerId !== args.runnerId) return null;
    if (!job.timeoutAt || job.timeoutAt.getTime() <= this.clock().getTime()) return null;
    return { ruleChain: job.ruleChain };
  }
}
