import type { AgentJobClaim, AgentJobOutcome, AgentJobRunnerState } from "./agent-runner.schema";

export abstract class AgentJobRunnerRepo {
  abstract claimNextForRunner(runnerId: string): Promise<AgentJobClaim | null>;
  abstract findForRunner(jobId: string, runnerId: string): Promise<AgentJobRunnerState | null>;
  abstract appendTranscript(jobId: string, runnerId: string, events: Record<string, unknown>[]): Promise<void>;
  abstract finish(jobId: string, runnerId: string, outcome: AgentJobOutcome): Promise<void>;
}
