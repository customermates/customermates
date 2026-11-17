import type { AgentJobClaim, AgentJobOutcome, AgentJobRunnerState } from "../agent-runner.schema";

import { AgentJobRunnerRepo } from "../agent-job-runner.repo";

import { COMPANY_ID, JOB_ID, OWNER_ID } from "./agent-runner-fixtures";

export type FakeJob = {
  id: string;
  companyId: string;
  ownerUserId: string;
  prompt: string;
  promptUntrusted: boolean;
  status: string;
  runnerId: string | null;
  attempts: number;
  timeoutAt: Date | null;
  transcript: Record<string, unknown>[];
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
      runnerId: null,
      attempts: 0,
      timeoutAt: null,
      transcript: [],
      outcome: null,
      ...overrides,
    };
    this.jobs.push(job);
    return job;
  }

  claimNextForRunner(runnerId: string): Promise<AgentJobClaim | null> {
    this.claimPolls += 1;
    const job = this.jobs.find((candidate) => candidate.status === "queued");
    if (!job) return Promise.resolve(null);
    job.status = "claimed";
    job.runnerId = runnerId;
    job.attempts += 1;
    job.timeoutAt = new Date(this.clock() + this.jobTimeoutMs);
    return Promise.resolve({
      id: job.id,
      companyId: job.companyId,
      ownerUserId: job.ownerUserId,
      prompt: job.prompt,
      promptUntrusted: job.promptUntrusted,
      timeoutAt: job.timeoutAt,
    });
  }

  findForRunner(jobId: string, runnerId: string): Promise<AgentJobRunnerState | null> {
    const job = this.jobs.find((candidate) => candidate.id === jobId && candidate.runnerId === runnerId);
    return Promise.resolve(job ? { id: job.id, status: job.status } : null);
  }

  appendTranscript(jobId: string, _runnerId: string, events: Record<string, unknown>[]): Promise<void> {
    this.jobs.find((candidate) => candidate.id === jobId)?.transcript.push(...events);
    return Promise.resolve();
  }

  finish(jobId: string, _runnerId: string, outcome: AgentJobOutcome): Promise<void> {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    if (job) {
      job.status = outcome.status;
      job.outcome = outcome;
    }
    return Promise.resolve();
  }
}
