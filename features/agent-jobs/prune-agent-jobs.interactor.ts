import type { AgentJobRepo } from "./agent-job.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pruneInBatches } from "@/core/utils/prune-in-batches";

import { AGENT_JOB_RETENTION_DAYS } from "./agent-job.schema";

@SystemInteractor
export class PruneAgentJobsInteractor {
  constructor(private readonly repo: Pick<AgentJobRepo, "deleteFinishedBeforeUnscoped">) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - AGENT_JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return { pruned: await pruneInBatches((limit) => this.repo.deleteFinishedBeforeUnscoped(before, limit)) };
  }
}
