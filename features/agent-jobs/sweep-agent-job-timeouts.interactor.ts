import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AgentJobCredits } from "./agent-job-credits";
import type { AgentJobQueueEntry, AgentJobRepo, AgentJobSweepOutcome } from "./agent-job.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import * as ErrorReporter from "@/core/observability/server";
import { AGENT_RUNNER_LIMITS } from "@/features/agent-runners/agent-runner.schema";

import { AGENT_JOB_HOSTED_RUNTIMES, AGENT_JOB_MAX_ATTEMPTS, AGENT_JOB_QUEUED_REDISPATCH_MS } from "./agent-job.schema";

const SWEEP_LIMIT = 200;

export type AgentJobSweepResult = {
  agentJobsTimedOut: number;
  agentJobsRequeued: number;
  agentJobsRedispatched: number;
  agentJobsExpired: number;
  agentJobsCancelled: number;
};

function isHosted(job: AgentJobQueueEntry): boolean {
  return (AGENT_JOB_HOSTED_RUNTIMES as readonly string[]).includes(job.runtime);
}

@SystemInteractor
export class SweepAgentJobTimeoutsInteractor {
  constructor(
    private readonly repo: Pick<
      AgentJobRepo,
      | "sweepTimeoutsUnscoped"
      | "findStaleQueuedUnscoped"
      | "expireQueuedUnscoped"
      | "cancelQueuedOfInactiveRulesUnscoped"
    >,
    private readonly tasks: Pick<BackgroundTaskService, "dispatch">,
    private readonly credits: AgentJobCredits,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<AgentJobSweepResult> {
    const now = args.now ?? new Date();
    const outcomes = await this.repo.sweepTimeoutsUnscoped({
      now,
      maxAttempts: AGENT_JOB_MAX_ATTEMPTS,
      limit: SWEEP_LIMIT,
    });
    for (const job of outcomes) await this.afterTimeout(job);
    const requeued = outcomes.filter((job) => job.requeued).length;

    const cancelled = await this.repo.cancelQueuedOfInactiveRulesUnscoped({ now, limit: SWEEP_LIMIT });
    const expired = await this.repo.expireQueuedUnscoped({
      queuedBefore: new Date(now.getTime() - AGENT_RUNNER_LIMITS.queuedExpiryMs),
      now,
      limit: SWEEP_LIMIT,
    });

    const stale = await this.repo.findStaleQueuedUnscoped({
      runtimes: AGENT_JOB_HOSTED_RUNTIMES,
      queuedBefore: new Date(now.getTime() - AGENT_JOB_QUEUED_REDISPATCH_MS),
      limit: SWEEP_LIMIT,
    });
    let redispatched = 0;
    for (const job of stale) if (await this.isolated(() => this.dispatch(job))) redispatched += 1;

    return {
      agentJobsTimedOut: outcomes.length - requeued,
      agentJobsRequeued: requeued,
      agentJobsRedispatched: redispatched,
      agentJobsExpired: expired,
      agentJobsCancelled: cancelled,
    };
  }

  private async afterTimeout(job: AgentJobSweepOutcome): Promise<void> {
    if (job.runtime === "mate") {
      await this.isolated(() =>
        this.credits.release({
          jobId: job.id,
          attempt: job.attempts,
          companyId: job.companyId,
          userId: job.ownerUserId,
        }),
      );
    }
    if (job.requeued && isHosted(job)) await this.isolated(() => this.dispatch(job));
  }

  private dispatch(job: AgentJobQueueEntry): Promise<void> {
    return this.tasks.dispatch("run-agent-job", {
      jobId: job.id,
      companyId: job.companyId,
      ownerUserId: job.ownerUserId,
    });
  }

  private async isolated(step: () => Promise<void>): Promise<boolean> {
    try {
      await step();
      return true;
    } catch (error) {
      ErrorReporter.captureException(error);
      return false;
    }
  }
}
