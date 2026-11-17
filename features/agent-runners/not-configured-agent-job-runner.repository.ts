import type { AgentJobClaim, AgentJobRunnerState } from "./agent-runner.schema";

import { AgentJobRunnerRepo } from "./agent-job-runner.repo";

export class NotConfiguredAgentJobRunnerRepo extends AgentJobRunnerRepo {
  claimNextForRunner(): Promise<AgentJobClaim | null> {
    return Promise.resolve(null);
  }

  findForRunner(): Promise<AgentJobRunnerState | null> {
    return Promise.resolve(null);
  }

  appendTranscript(): Promise<void> {
    return Promise.resolve();
  }

  finish(): Promise<void> {
    return Promise.resolve();
  }
}
