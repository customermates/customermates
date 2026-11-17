import { describe, expect, it } from "vitest";

import { FakeAgentJobRepo } from "@/features/agent-jobs/__tests__/fake-agent-job-repo";
import { AGENT_JOB_MAX_WALL_MS } from "@/features/agent-jobs/agent-job.schema";
import { QueuedAgentJobRunnerRepo } from "../queued-agent-job-runner.repository";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const RUNNER = { id: "00000000-0000-4000-8000-0000000000c1", companyId: COMPANY, name: "ws-main" };
const OTHER_RUNNER = { id: "00000000-0000-4000-8000-0000000000c2", companyId: COMPANY, name: "laptop" };
const FOREIGN_RUNNER = { id: RUNNER.id, companyId: "00000000-0000-4000-8000-000000000099", name: "elsewhere" };
const NOW = new Date("2026-11-17T09:00:00.000Z");

describe("QueuedAgentJobRunnerRepo", () => {
  it("claims the oldest queued runner job of the runner's workspace, marks it running and hands over the prompt", async () => {
    const jobs = new FakeAgentJobRepo();
    jobs.add({ runtime: "ownKey" });
    const job = jobs.add({ runtime: "runner", prompt: "Draft the reply", promptUntrusted: true });
    const repo = new QueuedAgentJobRunnerRepo(jobs, () => NOW);

    const claim = await repo.claimNextForRunner(RUNNER);

    expect(claim).toEqual({
      id: job.id,
      companyId: COMPANY,
      ownerUserId: job.ownerUserId,
      prompt: "Draft the reply",
      promptUntrusted: true,
      timeoutAt: new Date(NOW.getTime() + AGENT_JOB_MAX_WALL_MS),
    });
    expect(jobs.jobs.get(job.id)).toMatchObject({ status: "running", attempts: 1, claimedAt: NOW });
    expect(await repo.claimNextForRunner(RUNNER)).toBeNull();
    expect(jobs.jobs.values().next().value?.status).toBe("queued");
  });

  it("shows a job only to the runner that holds it, inside its own workspace", async () => {
    const jobs = new FakeAgentJobRepo();
    const job = jobs.add({ runtime: "runner", status: "running", runnerId: RUNNER.id });
    const repo = new QueuedAgentJobRunnerRepo(jobs, () => NOW);

    expect(await repo.findForRunner(job.id, RUNNER)).toEqual({ id: job.id, status: "running" });
    expect(await repo.findForRunner(job.id, OTHER_RUNNER)).toBeNull();
    expect(await repo.findForRunner(job.id, FOREIGN_RUNNER)).toBeNull();
    expect(await repo.findForRunner("00000000-0000-4000-8000-0000000000fe", RUNNER)).toBeNull();
  });

  it("appends transcript events and finishes the job with the runner's outcome", async () => {
    const jobs = new FakeAgentJobRepo();
    const job = jobs.add({ runtime: "runner", status: "running", runnerId: RUNNER.id });
    const repo = new QueuedAgentJobRunnerRepo(jobs, () => NOW);

    await repo.appendTranscript(job.id, RUNNER, [{ type: "message", text: "Working" }]);
    await repo.finish(job.id, RUNNER, {
      status: "succeeded",
      result: { summary: "Replied to the lead" },
      inputTokens: 120,
      outputTokens: 40,
      costMicrocents: 1200,
      error: null,
    });

    expect(jobs.events.get(job.id)).toEqual([{ type: "message", text: "Working" }]);
    expect(jobs.jobs.get(job.id)).toMatchObject({
      status: "succeeded",
      finishedAt: NOW,
      result: { summary: "Replied to the lead" },
      inputTokens: 120,
      outputTokens: 40,
      costMicrocents: BigInt(1200),
      error: null,
      timeoutAt: null,
    });
  });
});
