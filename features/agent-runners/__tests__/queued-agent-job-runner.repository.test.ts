import { describe, expect, it } from "vitest";

import { FakeAgentJobRepo } from "@/features/agent-jobs/__tests__/fake-agent-job-repo";
import { AGENT_JOB_MAX_WALL_MS } from "@/features/agent-jobs/agent-job.schema";
import { AGENT_RUNNER_LIMITS } from "../agent-runner.schema";
import { QueuedAgentJobRunnerRepo } from "../queued-agent-job-runner.repository";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const MEMBER = "00000000-0000-4000-8000-000000000010";
const OTHER_MEMBER = "00000000-0000-4000-8000-000000000020";
const RUNNER = { id: "00000000-0000-4000-8000-0000000000c1", companyId: COMPANY, name: "ws-main", createdById: MEMBER };
const OTHER_RUNNER = { ...RUNNER, id: "00000000-0000-4000-8000-0000000000c2", name: "laptop" };
const FOREIGN_RUNNER = { ...RUNNER, companyId: "00000000-0000-4000-8000-000000000099", name: "elsewhere" };
const NOW = new Date("2026-11-17T09:00:00.000Z");
const AT = "2026-11-17T09:00:05.000Z";

function setup(jobs = new FakeAgentJobRepo()) {
  const queries: Array<{ companyId: string; ownerUserId: string; runnerId: string; limit: number }> = [];
  const runners = {
    findClaimableJobIdsUnscoped: (args: (typeof queries)[number]) => {
      queries.push(args);
      const claimable = [...jobs.jobs.values()].filter(
        (job) =>
          job.companyId === args.companyId &&
          job.runtime === "runner" &&
          job.status === "queued" &&
          job.ownerUserId === args.ownerUserId &&
          (job.pinnedRunnerId === null || job.pinnedRunnerId === args.runnerId),
      );
      return Promise.resolve(claimable.slice(0, args.limit).map((job) => job.id));
    },
  };
  return { jobs, queries, repo: new QueuedAgentJobRunnerRepo(jobs, runners, () => NOW) };
}

describe("QueuedAgentJobRunnerRepo", () => {
  it("claims the oldest queued runner job of the runner's member and leaves it claimed until it is confirmed", async () => {
    const { jobs, repo, queries } = setup();
    jobs.add({ runtime: "ownKey" });
    const job = jobs.add({ runtime: "runner", prompt: "Draft the reply", promptUntrusted: true });

    const claim = await repo.claimNextForRunner(RUNNER);

    const confirmBy = new Date(NOW.getTime() + AGENT_RUNNER_LIMITS.claimConfirmMs);
    expect(claim).toEqual({
      id: job.id,
      companyId: COMPANY,
      ownerUserId: job.ownerUserId,
      attempt: 1,
      prompt: "Draft the reply",
      promptUntrusted: true,
      confirmBy,
    });
    expect(jobs.jobs.get(job.id)).toMatchObject({
      status: "claimed",
      attempts: 1,
      claimedAt: NOW,
      timeoutAt: confirmBy,
      runnerId: RUNNER.id,
    });
    expect(queries[0]).toEqual({
      companyId: COMPANY,
      ownerUserId: MEMBER,
      runnerId: RUNNER.id,
      limit: AGENT_RUNNER_LIMITS.claimCandidates,
    });
    expect(await repo.claimNextForRunner(RUNNER)).toBeNull();
    expect(jobs.jobs.values().next().value?.status).toBe("queued");
  });

  it("never claims the job of another member or a job pinned to another runner", async () => {
    const { jobs, repo } = setup();
    const foreign = jobs.add({ runtime: "runner", ownerUserId: OTHER_MEMBER });
    const pinned = jobs.add({ runtime: "runner", pinnedRunnerId: OTHER_RUNNER.id });

    expect(await repo.claimNextForRunner(RUNNER)).toBeNull();
    expect(jobs.jobs.get(foreign.id)?.status).toBe("queued");
    expect(jobs.jobs.get(pinned.id)?.status).toBe("queued");
    expect((await repo.claimNextForRunner(OTHER_RUNNER))?.id).toBe(pinned.id);
  });

  it("takes the next candidate when another runner claimed the first one in between", async () => {
    const { jobs, repo } = setup();
    const first = jobs.add({ runtime: "runner" });
    const second = jobs.add({ runtime: "runner" });
    const claimUnscoped = jobs.claimUnscoped.bind(jobs);
    jobs.claimUnscoped = (claim) => (claim.jobId === first.id ? Promise.resolve(null) : claimUnscoped(claim));

    expect((await repo.claimNextForRunner(RUNNER))?.id).toBe(second.id);
  });

  it("starts the claimed attempt with the full run time and refuses another attempt", async () => {
    const { jobs, repo } = setup();
    const job = jobs.add({ runtime: "runner", status: "claimed", runnerId: RUNNER.id, attempts: 2 });

    expect(await repo.start(job.id, RUNNER, 1)).toBeNull();
    expect(jobs.jobs.get(job.id)?.status).toBe("claimed");
    expect(await repo.start(job.id, RUNNER, 2)).toEqual(new Date(NOW.getTime() + AGENT_JOB_MAX_WALL_MS));
    expect(jobs.jobs.get(job.id)?.status).toBe("running");
    expect(await repo.start(job.id, RUNNER, 2)).toBeNull();
  });

  it("marks the transcript when the runner confirms a further attempt, and not on the first", async () => {
    const { jobs, repo } = setup();
    const first = jobs.add({ runtime: "runner", status: "claimed", runnerId: RUNNER.id, attempts: 1 });
    const retried = jobs.add({
      runtime: "runner",
      status: "claimed",
      runnerId: RUNNER.id,
      attempts: 3,
      startedAttempts: 1,
    });
    jobs.events.set(retried.id, [{ type: "message", at: AT, role: "assistant", text: "Working" }]);

    await repo.start(first.id, RUNNER, 1);
    await repo.start(retried.id, RUNNER, 3);

    expect(jobs.events.get(first.id)).toBeUndefined();
    expect(jobs.events.get(retried.id)).toEqual([
      { type: "message", at: AT, role: "assistant", text: "Working" },
      { type: "attempt", at: NOW.toISOString(), attempt: 2 },
    ]);
  });

  it("shows a job only to the runner that holds it, inside its own workspace", async () => {
    const { jobs, repo } = setup();
    const timeoutAt = new Date(NOW.getTime() + 60_000);
    const job = jobs.add({ runtime: "runner", status: "running", runnerId: RUNNER.id, attempts: 1, timeoutAt });

    expect(await repo.findForRunner(job.id, RUNNER)).toEqual({ id: job.id, status: "running", attempt: 1, timeoutAt });
    expect(await repo.findForRunner(job.id, OTHER_RUNNER)).toBeNull();
    expect(await repo.findForRunner(job.id, FOREIGN_RUNNER)).toBeNull();
    expect(await repo.findForRunner("00000000-0000-4000-8000-0000000000fe", RUNNER)).toBeNull();
  });

  it("appends transcript events and finishes the job only for the attempt that runs, without a cost", async () => {
    const { jobs, repo } = setup();
    const job = jobs.add({ runtime: "runner", status: "running", runnerId: RUNNER.id, attempts: 2 });
    const event = { type: "message" as const, at: AT, role: "assistant" as const, text: "Working" };
    const outcome = {
      status: "succeeded" as const,
      result: { text: "Replied to the lead", reason: "stop" as const, toolCalls: 3 },
      inputTokens: 120,
      outputTokens: 40,
      error: null,
    };

    expect(await repo.appendTranscript(job.id, RUNNER, 1, [event])).toBe(false);
    expect(await repo.finish(job.id, RUNNER, 1, outcome)).toBe(false);
    expect(jobs.jobs.get(job.id)?.status).toBe("running");

    expect(await repo.appendTranscript(job.id, RUNNER, 2, [event])).toBe(true);
    expect(await repo.finish(job.id, RUNNER, 2, outcome)).toBe(true);

    expect(jobs.events.get(job.id)).toEqual([event]);
    expect(jobs.jobs.get(job.id)).toMatchObject({
      status: "succeeded",
      finishedAt: NOW,
      result: { text: "Replied to the lead", reason: "stop", toolCalls: 3 },
      inputTokens: 120,
      outputTokens: 40,
      costMicrocents: null,
      error: null,
      timeoutAt: null,
    });
  });

  it("admits a job key only while that attempt runs on that runner, and hands over the rule chain", async () => {
    const { jobs, repo } = setup();
    const job = jobs.add({
      runtime: "runner",
      status: "running",
      runnerId: RUNNER.id,
      attempts: 2,
      ruleChain: ["rule-1"],
    });
    const key = { companyId: COMPANY, jobId: job.id, attempt: 2, runnerId: RUNNER.id };

    expect(await repo.findRunningAttempt(key)).toEqual({ ruleChain: ["rule-1"] });
    expect(await repo.findRunningAttempt({ ...key, attempt: 1 })).toBeNull();
    expect(await repo.findRunningAttempt({ ...key, runnerId: OTHER_RUNNER.id })).toBeNull();
    expect(await repo.findRunningAttempt({ ...key, companyId: FOREIGN_RUNNER.companyId })).toBeNull();

    for (const status of ["claimed", "succeeded", "failed", "timedOut", "cancelled", "queued"] as const) {
      jobs.jobs.set(job.id, { ...job, status });
      expect(await repo.findRunningAttempt(key)).toBeNull();
    }
    jobs.jobs.set(job.id, { ...job, runtime: "ownKey" });
    expect(await repo.findRunningAttempt(key)).toBeNull();
  });
});
