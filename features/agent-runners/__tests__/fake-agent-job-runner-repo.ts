import type { AgentJobCredentialRun, AgentJobRunnerState } from "../agent-job-runner.repo";
import type {
  AgentJobClaim,
  AgentJobOutcome,
  AgentRunnerTranscriptEvent,
  AuthenticatedAgentRunner,
} from "../agent-runner.schema";

import { AgentJobRunnerRepo } from "../agent-job-runner.repo";
import { AGENT_RUNNER_LIMITS } from "../agent-runner.schema";

import { COMPANY_ID, JOB_ID, OWNER_ID } from "./agent-runner-fixtures";

const LIVE = new Set(["claimed", "running"]);

export type FakeJob = {
  id: string;
  companyId: string;
  ownerUserId: string;
  prompt: string;
  promptUntrusted: boolean;
  status: string;
  pinnedRunnerId: string | null;
  runnerId: string | null;
  attempts: number;
  timeoutAt: Date | null;
  ruleChain: string[];
  transcript: AgentRunnerTranscriptEvent[];
  outcome: AgentJobOutcome | null;
};

export class FakeAgentJobRunnerRepo extends AgentJobRunnerRepo {
  jobs: FakeJob[] = [];
  claimPolls = 0;
  jobTimeoutMs = 10 * 60_000;

  constructor(private readonly clock: () => number = () => Date.now()) {
    super();
  }

  addJob(overrides: Partial<FakeJob> = {}): FakeJob {
    const job: FakeJob = {
      id: JOB_ID,
      companyId: COMPANY_ID,
      ownerUserId: OWNER_ID,
      prompt: "Summarise the open deals",
      promptUntrusted: false,
      status: "queued",
      pinnedRunnerId: null,
      runnerId: null,
      attempts: 0,
      timeoutAt: null,
      ruleChain: [],
      transcript: [],
      outcome: null,
      ...overrides,
    };
    this.jobs.push(job);
    return job;
  }

  claimNextForRunner(runner: AuthenticatedAgentRunner): Promise<AgentJobClaim | null> {
    this.claimPolls += 1;
    const job = this.jobs.find(
      (candidate) =>
        candidate.status === "queued" &&
        candidate.companyId === runner.companyId &&
        candidate.ownerUserId === runner.createdById &&
        (candidate.pinnedRunnerId === null || candidate.pinnedRunnerId === runner.id),
    );
    if (!job) return Promise.resolve(null);
    job.status = "claimed";
    job.runnerId = runner.id;
    job.attempts += 1;
    job.timeoutAt = new Date(this.clock() + AGENT_RUNNER_LIMITS.claimConfirmMs);
    return Promise.resolve({
      id: job.id,
      companyId: job.companyId,
      ownerUserId: job.ownerUserId,
      attempt: job.attempts,
      prompt: job.prompt,
      promptUntrusted: job.promptUntrusted,
      confirmBy: job.timeoutAt,
    });
  }

  releaseClaim(jobId: string, runner: AuthenticatedAgentRunner, attempt: number): Promise<boolean> {
    const job = this.jobs.find((candidate) => candidate.id === jobId && candidate.runnerId === runner.id);
    if (!job || job.status !== "claimed" || job.attempts !== attempt) return Promise.resolve(false);
    job.status = "queued";
    job.runnerId = null;
    job.timeoutAt = null;
    return Promise.resolve(true);
  }

  findForRunner(jobId: string, runner: AuthenticatedAgentRunner): Promise<AgentJobRunnerState | null> {
    const job = this.jobs.find((candidate) => candidate.id === jobId && candidate.runnerId === runner.id);
    return Promise.resolve(
      job ? { id: job.id, status: job.status, attempt: job.attempts, timeoutAt: job.timeoutAt } : null,
    );
  }

  start(jobId: string, _runner: AuthenticatedAgentRunner, attempt: number): Promise<Date | null> {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status !== "claimed" || job.attempts !== attempt) return Promise.resolve(null);
    job.status = "running";
    job.timeoutAt = new Date(this.clock() + this.jobTimeoutMs);
    return Promise.resolve(job.timeoutAt);
  }

  appendTranscript(
    jobId: string,
    _runner: AuthenticatedAgentRunner,
    attempt: number,
    events: AgentRunnerTranscriptEvent[],
  ): Promise<boolean> {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || !LIVE.has(job.status) || job.attempts !== attempt) return Promise.resolve(false);
    job.transcript.push(...events);
    return Promise.resolve(true);
  }

  finish(
    jobId: string,
    _runner: AuthenticatedAgentRunner,
    attempt: number,
    outcome: AgentJobOutcome,
  ): Promise<boolean> {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (!job || !LIVE.has(job.status) || job.attempts !== attempt) return Promise.resolve(false);
    job.status = outcome.status;
    job.outcome = outcome;
    return Promise.resolve(true);
  }

  findRunningAttempt(args: {
    companyId: string;
    jobId: string;
    attempt: number;
    runnerId: string;
  }): Promise<AgentJobCredentialRun | null> {
    const job = this.jobs.find(
      (candidate) =>
        candidate.id === args.jobId &&
        candidate.companyId === args.companyId &&
        candidate.status === "running" &&
        candidate.attempts === args.attempt &&
        candidate.runnerId === args.runnerId &&
        candidate.timeoutAt !== null &&
        candidate.timeoutAt.getTime() > this.clock(),
    );
    return Promise.resolve(job ? { ruleChain: job.ruleChain } : null);
  }
}
