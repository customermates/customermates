import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AgentJobCredits } from "./agent-job-credits";
import type { AgentJobQueueEntry, AgentJobRepo, AgentJobSweepOutcome } from "./agent-job.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import * as ErrorReporter from "@/core/observability/server";
import { AGENT_RUNNER_LIMITS } from "@/features/agent-runners/agent-runner.schema";

import {
  AGENT_JOB_HOSTED_RUNTIMES,
  AGENT_JOB_QUEUED_REDISPATCH_MS,
  AGENT_JOB_RESERVATION_MAX_AGE_MS,
} from "./agent-job.schema";

const SWEEP_LIMIT = 200;

export type AgentJobSweepResult = {
  agentJobsTimedOut: number;
  agentJobsRequeued: number;
  agentJobsRedispatched: number;
  agentJobsExpired: number;
  agentJobsCancelled: number;
  agentJobReservationsClosed: number;
};

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
    private readonly credits: Pick<AgentJobCredits, "settleInterrupted" | "closeAbandoned">,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<AgentJobSweepResult> {
    const now = args.now ?? new Date();
    const outcomes = await this.repo.sweepTimeoutsUnscoped({ now, limit: SWEEP_LIMIT });
    for (const job of outcomes) await this.afterTimeout(job);
    const requeued = outcomes.filter((job) => job.requeued).length;
    const reservationsClosed = await this.closeAbandonedReservations(now);

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
      agentJobReservationsClosed: reservationsClosed,
    };
  }

  private async closeAbandonedReservations(now: Date): Promise<number> {
    try {
      return await this.credits.closeAbandoned({
        reservedBefore: new Date(now.getTime() - AGENT_JOB_RESERVATION_MAX_AGE_MS),
        now,
        limit: SWEEP_LIMIT,
      });
    } catch (error) {
      ErrorReporter.captureException(error);
      return 0;
    }
  }

  private async afterTimeout(job: AgentJobSweepOutcome): Promise<void> {
    if (job.runtime !== "mate" || !job.started) return;
    await this.isolated(async () => {
      await this.credits.settleInterrupted({
        jobId: job.id,
        attempt: job.attempts,
        companyId: job.companyId,
        userId: job.ownerUserId,
      });
    });
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
