import type { Prisma } from "@/generated/prisma";
import type { AgentJobRepo } from "@/features/agent-jobs/agent-job.repo";
import type {
  AgentJobClaim,
  AgentJobOutcome,
  AgentJobRunnerState,
  AuthenticatedAgentRunner,
} from "./agent-runner.schema";

import { AGENT_JOB_MAX_WALL_MS, AGENT_JOB_TRANSCRIPT_MAX_EVENTS } from "@/features/agent-jobs/agent-job.schema";

import { AgentJobRunnerRepo } from "./agent-job-runner.repo";

type Jobs = Pick<
  AgentJobRepo,
  "claimUnscoped" | "startUnscoped" | "findUnscoped" | "appendEventsUnscoped" | "finishUnscoped"
>;

export class QueuedAgentJobRunnerRepo extends AgentJobRunnerRepo {
  constructor(
    private readonly jobs: Jobs,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  async claimNextForRunner(runner: AuthenticatedAgentRunner): Promise<AgentJobClaim | null> {
    const now = this.clock();
    const timeoutAt = new Date(now.getTime() + AGENT_JOB_MAX_WALL_MS);
    const job = await this.jobs.claimUnscoped({
      companyId: runner.companyId,
      runtime: "runner",
      runnerId: runner.id,
      now,
      timeoutAt,
    });
    if (!job) return null;
    await this.jobs.startUnscoped({ id: job.id, companyId: runner.companyId, now, timeoutAt });
    return {
      id: job.id,
      companyId: job.companyId,
      ownerUserId: job.ownerUserId,
      prompt: job.prompt,
      promptUntrusted: job.promptUntrusted,
      timeoutAt,
    };
  }

  async findForRunner(jobId: string, runner: AuthenticatedAgentRunner): Promise<AgentJobRunnerState | null> {
    const job = await this.jobs.findUnscoped(runner.companyId, jobId);
    return job && job.runnerId === runner.id ? { id: job.id, status: job.status } : null;
  }

  async appendTranscript(
    jobId: string,
    runner: AuthenticatedAgentRunner,
    events: Record<string, unknown>[],
  ): Promise<void> {
    await this.jobs.appendEventsUnscoped({
      id: jobId,
      companyId: runner.companyId,
      events: events as unknown as Prisma.InputJsonValue[],
      maxEvents: AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
    });
  }

  async finish(jobId: string, runner: AuthenticatedAgentRunner, outcome: AgentJobOutcome): Promise<void> {
    await this.jobs.finishUnscoped({
      id: jobId,
      companyId: runner.companyId,
      status: outcome.status,
      result: outcome.result,
      error: outcome.error,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costMicrocents: outcome.costMicrocents,
      now: this.clock(),
    });
  }
}
