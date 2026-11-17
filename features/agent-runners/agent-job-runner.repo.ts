import type {
  AgentJobClaim,
  AgentJobOutcome,
  AgentJobRunnerState,
  AuthenticatedAgentRunner,
} from "./agent-runner.schema";

export abstract class AgentJobRunnerRepo {
  abstract claimNextForRunner(runner: AuthenticatedAgentRunner): Promise<AgentJobClaim | null>;
  abstract findForRunner(jobId: string, runner: AuthenticatedAgentRunner): Promise<AgentJobRunnerState | null>;
  abstract appendTranscript(
    jobId: string,
    runner: AuthenticatedAgentRunner,
    events: Record<string, unknown>[],
  ): Promise<void>;
  abstract finish(jobId: string, runner: AuthenticatedAgentRunner, outcome: AgentJobOutcome): Promise<void>;
}
