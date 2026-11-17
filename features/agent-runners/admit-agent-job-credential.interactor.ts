import type { AgentJobCredentialMarker } from "./agent-job-credential-marker";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentJobRequest } from "./agent-job-request-context";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export type AgentJobCredentialAdmission = AgentJobCredentialMarker & { keyId: string; companyId: string | null };

@SystemInteractor
export class AdmitAgentJobCredentialInteractor {
  constructor(private readonly jobs: Pick<AgentJobRunnerRepo, "findRunningAttempt">) {}

  async invoke(key: AgentJobCredentialAdmission): Promise<AgentJobRequest | null> {
    if (!key.companyId) return null;
    const run = await this.jobs.findRunningAttempt({
      companyId: key.companyId,
      jobId: key.jobId,
      attempt: key.attempt,
      runnerId: key.runnerId,
    });
    if (!run) return null;
    return {
      keyId: key.keyId,
      companyId: key.companyId,
      jobId: key.jobId,
      attempt: key.attempt,
      ruleChain: run.ruleChain,
    };
  }
}
