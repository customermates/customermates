import type {
  AgentJobClaim,
  AgentJobOutcome,
  AgentRunnerTranscriptEvent,
  AuthenticatedAgentRunner,
} from "./agent-runner.schema";

export type AgentJobRunnerState = { id: string; status: string; attempt: number; timeoutAt: Date | null };

export type AgentJobCredentialRun = { ruleChain: string[] };

export abstract class AgentJobRunnerRepo {
  abstract claimNextForRunner(runner: AuthenticatedAgentRunner): Promise<AgentJobClaim | null>;
  abstract releaseClaim(jobId: string, runner: AuthenticatedAgentRunner, attempt: number): Promise<boolean>;
  abstract findForRunner(jobId: string, runner: AuthenticatedAgentRunner): Promise<AgentJobRunnerState | null>;
  abstract start(jobId: string, runner: AuthenticatedAgentRunner, attempt: number): Promise<Date | null>;
  abstract appendTranscript(
    jobId: string,
    runner: AuthenticatedAgentRunner,
    attempt: number,
    events: AgentRunnerTranscriptEvent[],
  ): Promise<boolean>;
  abstract finish(
    jobId: string,
    runner: AuthenticatedAgentRunner,
    attempt: number,
    outcome: AgentJobOutcome,
  ): Promise<boolean>;
  abstract findRunningAttempt(args: {
    companyId: string;
    jobId: string;
    attempt: number;
    runnerId: string;
  }): Promise<AgentJobCredentialRun | null>;
}
