import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AgentJobCredits } from "./agent-job-credits";
import type { AgentJobRepo } from "./agent-job.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { AGENT_JOB_MAX_ATTEMPTS } from "./agent-job.schema";

const SWEEP_LIMIT = 200;

@SystemInteractor
export class SweepAgentJobTimeoutsInteractor {
  constructor(
    private readonly repo: Pick<AgentJobRepo, "sweepTimeoutsUnscoped">,
    private readonly tasks: Pick<BackgroundTaskService, "dispatch">,
    private readonly credits: AgentJobCredits,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ agentJobsTimedOut: number; agentJobsRequeued: number }> {
    const outcomes = await this.repo.sweepTimeoutsUnscoped({
      now: args.now ?? new Date(),
      maxAttempts: AGENT_JOB_MAX_ATTEMPTS,
      limit: SWEEP_LIMIT,
    });
    let requeued = 0;
    for (const job of outcomes) {
      if (job.runtime === "mate") {
        await this.credits.release({
          jobId: job.id,
          attempt: job.attempts,
          companyId: job.companyId,
          userId: job.ownerUserId,
        });
      }
      if (!job.requeued) continue;
      requeued += 1;
      if (job.runtime !== "runner") {
        await this.tasks.dispatch("run-agent-job", {
          jobId: job.id,
          companyId: job.companyId,
          ownerUserId: job.ownerUserId,
        });
      }
    }
    return { agentJobsTimedOut: outcomes.length - requeued, agentJobsRequeued: requeued };
  }
}
