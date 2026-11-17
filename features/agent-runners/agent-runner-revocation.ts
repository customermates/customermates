import type { AgentJobRepo } from "@/features/agent-jobs/agent-job.repo";
import type { AgentJobCredentials } from "./agent-job-credentials";
import type { AgentRunnerRepo } from "./agent-runner.repo";

import * as ErrorReporter from "@/core/observability/server";

type Runners = Pick<
  AgentRunnerRepo,
  "revokeRunnerUnscoped" | "findUnrevokedRunnerIdsOfUnscoped" | "findLiveJobsOfRunnerUnscoped"
>;

export class AgentRunnerRevocation {
  constructor(
    private readonly runners: Runners,
    private readonly jobs: Pick<AgentJobRepo, "cancelForRunnerUnscoped">,
    private readonly credentials: Pick<AgentJobCredentials, "revoke">,
  ) {}

  async revoke(args: { companyId: string; runnerId: string; at: Date }): Promise<void> {
    await this.runners.revokeRunnerUnscoped({ companyId: args.companyId, id: args.runnerId, at: args.at });
    const live = await this.runners.findLiveJobsOfRunnerUnscoped({
      companyId: args.companyId,
      runnerId: args.runnerId,
    });
    await this.jobs.cancelForRunnerUnscoped({ companyId: args.companyId, runnerId: args.runnerId, now: args.at });
    for (const job of live) {
      await this.credentials
        .revoke({ companyId: args.companyId, jobId: job.id, attempt: job.attempts })
        .catch((error: unknown) => {
          ErrorReporter.captureException(error, {
            tags: { kind: "agent-job-credentials-revoke", companyId: args.companyId },
          });
        });
    }
  }

  async revokeOfMember(args: { companyId: string; userId: string; at: Date }): Promise<number> {
    const runnerIds = await this.runners.findUnrevokedRunnerIdsOfUnscoped({
      companyId: args.companyId,
      createdById: args.userId,
    });
    for (const runnerId of runnerIds) await this.revoke({ companyId: args.companyId, runnerId, at: args.at });
    return runnerIds.length;
  }
}
