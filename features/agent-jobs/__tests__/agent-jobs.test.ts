import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { Action, Resource } from "@/generated/prisma";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const OWNER = "00000000-0000-4000-8000-000000000010";
const COMPANY = "00000000-0000-4000-8000-000000000011";
const COLLEAGUE = "00000000-0000-4000-8000-000000000012";

const mockUser = createMockUser({ id: OWNER, companyId: COMPANY });
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/observability/server", () => sentry);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";

import { runInCausation } from "@/core/decorators/causation-context";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { encodeAgentJobCursor } from "../agent-job-cursor";
import { AGENT_JOB_PAGE_SIZE, AGENT_JOB_RETENTION_DAYS } from "../agent-job.schema";
import { EnqueueAgentJobInteractor } from "../enqueue-agent-job.interactor";
import { GetAgentJobInteractor } from "../get-agent-job.interactor";
import { GetAgentJobsInteractor } from "../get-agent-jobs.interactor";
import { PruneAgentJobsInteractor } from "../prune-agent-jobs.interactor";
import { SweepAgentJobTimeoutsInteractor } from "../sweep-agent-job-timeouts.interactor";
import { DiscardAgentJobInteractor } from "../discard-agent-job.interactor";
import { FakeAgentJobRepo } from "./fake-agent-job-repo";

const RUN = "00000000-0000-4000-8000-0000000000a1";
const TYPE = "11111111-1111-4111-8111-111111111111";
const RECORD = "44444444-4444-4444-8444-444444444444";
const RUNNER = "00000000-0000-4000-8000-0000000000c1";
const NOW = new Date("2026-11-17T12:00:00.000Z");

function availability(overrides: Partial<AgentRuntimeAvailability> = {}): AgentRuntimeAvailability {
  const option = { available: true, reason: null, models: [], runners: [] };
  return {
    mate: option,
    ownKey: { ...option, models: [{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" }] },
    runner: { ...option, runners: [{ id: RUNNER, name: "ws-main", online: true }] },
    ...overrides,
  };
}

function unavailable(reason: "plan" | "noKey" | "noRunner" | "selfHosted") {
  return { available: false, reason, models: [], runners: [] };
}

const input = {
  companyId: COMPANY,
  runId: RUN,
  ownerUserId: OWNER,
  runtime: "ownKey" as const,
  prompt: "Summarise the deal {{record.name}}",
  promptUntrusted: false,
  model: null,
  runnerId: null,
  recordRef: { typeId: TYPE, recordId: RECORD },
};

function issue(result: unknown) {
  const failed = result as { error?: { issues: Array<{ path: PropertyKey[]; params?: Record<string, unknown> }> } };
  const first = failed.error?.issues[0];
  return { path: first?.path, error: first?.params?.error, reason: first?.params?.reason };
}

describe("enqueueing an agent job from an automation", () => {
  let repo: FakeAgentJobRepo;
  let dispatch: ReturnType<typeof vi.fn>;
  let source: { availability: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = new FakeAgentJobRepo();
    dispatch = vi.fn().mockResolvedValue(undefined);
    source = { availability: vi.fn().mockResolvedValue(availability()) };
  });

  const enqueue = (data: unknown, user = mockUser) =>
    runWithTenant(user, () =>
      new EnqueueAgentJobInteractor(repo, source as never, { dispatch } as never).enqueue(data as never),
    );

  it("queues a job with the triggering record in its prompt and starts the hosted run", async () => {
    const outcome = await enqueue(input);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const job = repo.jobs.get(outcome.jobId);
    expect(job).toMatchObject({
      companyId: COMPANY,
      runtime: "ownKey",
      status: "queued",
      sourceKind: "automation",
      sourceId: RUN,
      ownerUserId: OWNER,
      promptUntrusted: false,
    });
    expect(job?.prompt).toContain("Summarise the deal {{record.name}}");
    expect(job?.prompt).toContain(`list ${TYPE}, record ${RECORD}`);
    expect(dispatch).toHaveBeenCalledWith("run-agent-job", {
      jobId: outcome.jobId,
      companyId: COMPANY,
      ownerUserId: OWNER,
    });
  });

  it("stores the rule chain of the run that enqueues the job, and an empty chain outside a rule run", async () => {
    const RULE_A = "00000000-0000-4000-8000-0000000000d1";
    const RULE_B = "00000000-0000-4000-8000-0000000000d2";

    const inRun = await runInCausation({ ruleChain: [RULE_A, RULE_B] }, () => enqueue(input));
    const outside = await enqueue(input);

    expect(inRun.ok && repo.jobs.get(inRun.jobId)?.ruleChain).toEqual([RULE_A, RULE_B]);
    expect(outside.ok && repo.jobs.get(outside.jobId)?.ruleChain).toEqual([]);
  });

  it("runs Mate jobs the same way and keeps the untrusted marker of the trigger", async () => {
    const outcome = await enqueue({ ...input, runtime: "mate", recordRef: null, promptUntrusted: true });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(repo.jobs.get(outcome.jobId)).toMatchObject({ runtime: "mate", promptUntrusted: true });
    expect(repo.jobs.get(outcome.jobId)?.prompt).toBe(input.prompt);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("only queues a runner job: the runner consumes it", async () => {
    const outcome = await enqueue({ ...input, runtime: "runner", runnerId: RUNNER });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(repo.jobs.get(outcome.jobId)).toMatchObject({
      runtime: "runner",
      pinnedRunnerId: RUNNER,
      runnerId: null,
      status: "queued",
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses with the reason the runtime is unavailable and writes nothing", async () => {
    for (const [runtime, reason] of [
      ["mate", "selfHosted"],
      ["ownKey", "plan"],
      ["ownKey", "noKey"],
      ["runner", "noRunner"],
    ] as const) {
      source.availability.mockResolvedValue(availability({ [runtime]: unavailable(reason) }));
      expect(await enqueue({ ...input, runtime, runnerId: null, model: null })).toEqual({
        ok: false,
        reason: `agentRuntimeUnavailable:${reason}`,
      });
    }
    expect(repo.jobs.size).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses a model the workspace's keys do not offer and a runner that is not live", async () => {
    expect(await enqueue({ ...input, model: "gpt-5" })).toEqual({ ok: false, reason: "agentModelUnavailable" });
    expect(await enqueue({ ...input, model: "claude-sonnet-5-5" })).toMatchObject({ ok: true });
    expect(await enqueue({ ...input, runtime: "runner", runnerId: "00000000-0000-4000-8000-0000000000c9" })).toEqual({
      ok: false,
      reason: "agentRunnerUnavailable",
    });
  });

  it("only queues for the workspace and the owner it runs as", async () => {
    expect(await enqueue({ ...input, companyId: "00000000-0000-4000-8000-0000000000ff" })).toEqual({
      ok: false,
      reason: "agentJobRefused",
    });
    expect(await enqueue({ ...input, ownerUserId: COLLEAGUE })).toEqual({ ok: false, reason: "agentJobRefused" });
    expect(repo.jobs.size).toBe(0);
  });

  it("refuses malformed input without touching the queue", async () => {
    for (const bad of [
      { ...input, prompt: "  " },
      { ...input, runtime: "claude" },
      { ...input, runId: "not-a-uuid" },
    ])
      expect(await enqueue(bad)).toEqual({ ok: false, reason: "agentJobRefused" });
    expect(repo.jobs.size).toBe(0);
  });
});

describe("reading the run history", () => {
  let repo: FakeAgentJobRepo;
  beforeEach(() => {
    repo = new FakeAgentJobRepo();
  });

  const list = (data: unknown, user = mockUser) =>
    runWithTenant(user, () => new GetAgentJobsInteractor(repo).invoke(data as never));
  const detail = (id: string, user = mockUser) =>
    runWithTenant(user, () => new GetAgentJobInteractor(repo).invoke({ id } as never));

  it("pages newest first with a cursor and tells the end of the list", async () => {
    for (let index = 0; index < AGENT_JOB_PAGE_SIZE + 3; index += 1) repo.add();

    const first = await list({});
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.jobs).toHaveLength(AGENT_JOB_PAGE_SIZE);
    expect(first.data.nextCursor).toEqual(expect.any(String));

    const second = await list({ cursor: first.data.nextCursor });
    expect(second.ok && second.data.jobs).toHaveLength(3);
    expect(second.ok && second.data.nextCursor).toBeNull();
    const seen = new Set([...first.data.jobs, ...(second.ok ? second.data.jobs : [])].map((job) => job.id));
    expect(seen.size).toBe(AGENT_JOB_PAGE_SIZE + 3);
  });

  it("filters by status and source and refuses a cursor that is not ours", async () => {
    const failed = repo.add({ status: "failed", sourceId: RUN });
    repo.add({ status: "succeeded", sourceId: RUN });
    repo.add({ status: "failed", sourceId: null });

    const result = await list({ status: ["failed"], sourceKind: "automation", sourceId: RUN });
    expect(result.ok && result.data.jobs.map((job) => job.id)).toEqual([failed.id]);

    const bad = await list({ cursor: "not-a-cursor" });
    expect(bad.ok).toBe(false);
    expect(issue(bad).error).toBe(CustomErrorCode.agentJobCursorInvalid);
    expect((await list({ cursor: encodeAgentJobCursor({ createdAt: NOW, id: "x" }) })).ok).toBe(true);
  });

  it("shows a member their own runs and an administrator everyone's", async () => {
    const mine = repo.add({ ownerUserId: COLLEAGUE });
    const theirs = repo.add({ ownerUserId: OWNER });
    const member = createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readOwn }]);
    const memberUser = { ...member, id: COLLEAGUE, companyId: COMPANY };

    const own = await list({}, memberUser);
    expect(own.ok && own.data.jobs.map((job) => job.id)).toEqual([mine.id]);
    expect((await detail(theirs.id, memberUser)).ok).toBe(false);
    expect(issue(await detail(theirs.id, memberUser)).error).toBe(CustomErrorCode.agentJobNotFound);

    const everyone = await list({});
    expect(everyone.ok && everyone.data.jobs).toHaveLength(2);
  });

  it("returns the transcript of one run and drops entries it cannot read", async () => {
    const job = repo.add({
      status: "succeeded",
      result: { text: "Created one action", reason: "stop", toolCalls: 1 },
      costMicrocents: 1200n,
      transcript: [
        { type: "message", at: "2026-11-17T08:00:00.000Z", role: "user", text: "Do the thing" },
        {
          type: "toolCall",
          at: "2026-11-17T08:00:01.000Z",
          toolCallId: "c1",
          name: "query_crm_records",
          argumentsDigest: "{}",
        },
        { type: "weird", at: "x" },
        {
          type: "toolResult",
          at: "2026-11-17T08:00:02.000Z",
          toolCallId: "c1",
          name: "query_crm_records",
          ok: true,
          summary: "3 rows",
        },
        { type: "finish", at: "2026-11-17T08:00:03.000Z", reason: "stop", text: "Created one action" },
      ],
    });

    const result = await detail(job.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transcript.map((event) => event.type)).toEqual(["message", "toolCall", "toolResult", "finish"]);
    expect(result.data).toMatchObject({
      costMicrocents: 1200,
      result: { text: "Created one action", reason: "stop", toolCalls: 1 },
      prompt: "Do the thing",
    });
    expect((await detail("00000000-0000-4000-8000-0000000000fe")).ok).toBe(false);
  });
});

describe("sweeping timed-out jobs", () => {
  it("re-queues the first timeout and restarts hosted runs, but leaves a runner job to its runner", async () => {
    const repo = new FakeAgentJobRepo();
    const expired = new Date(NOW.getTime() - 1000);
    const hosted = repo.add({ runtime: "ownKey", status: "running", attempts: 1, timeoutAt: expired });
    const runner = repo.add({ runtime: "runner", status: "claimed", attempts: 1, timeoutAt: expired });
    const mate = repo.add({ runtime: "mate", status: "running", attempts: 2, timeoutAt: expired });
    const fresh = repo.add({
      runtime: "ownKey",
      status: "running",
      attempts: 1,
      timeoutAt: new Date(NOW.getTime() + 1000),
    });
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn().mockResolvedValue(undefined);

    const result = await new SweepAgentJobTimeoutsInteractor(repo, { dispatch }, { release }).invoke({ now: NOW });

    expect(result).toEqual({
      agentJobsTimedOut: 1,
      agentJobsRequeued: 2,
      agentJobsRedispatched: 0,
      agentJobsExpired: 0,
      agentJobsCancelled: 0,
    });
    expect(repo.jobs.get(hosted.id)).toMatchObject({ status: "queued", queuedAt: NOW });
    expect(repo.jobs.get(runner.id)?.status).toBe("queued");
    expect(repo.jobs.get(mate.id)?.status).toBe("timedOut");
    expect(repo.jobs.get(fresh.id)?.status).toBe("running");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("run-agent-job", {
      jobId: hosted.id,
      companyId: COMPANY,
      ownerUserId: OWNER,
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith({ jobId: mate.id, attempt: 2, companyId: COMPANY, userId: OWNER });
  });

  it("starts a hosted job again that stayed queued past the grace, and leaves fresh and runner jobs alone", async () => {
    const repo = new FakeAgentJobRepo();
    const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
    // The dispatch after enqueue was lost: nothing would ever start these two.
    const lostOwnKey = repo.add({ runtime: "ownKey", queuedAt: minutesAgo(3) });
    const lostMate = repo.add({ runtime: "mate", queuedAt: minutesAgo(6) });
    const justQueued = repo.add({ runtime: "ownKey", queuedAt: minutesAgo(1) });
    const waitingForRunner = repo.add({ runtime: "runner", queuedAt: minutesAgo(6) });
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn().mockResolvedValue(undefined);

    const result = await new SweepAgentJobTimeoutsInteractor(repo, { dispatch }, { release }).invoke({ now: NOW });

    expect(result).toMatchObject({ agentJobsTimedOut: 0, agentJobsRequeued: 0, agentJobsRedispatched: 2 });
    expect(dispatch.mock.calls.map(([, payload]) => (payload as { jobId: string }).jobId).sort()).toEqual(
      [lostOwnKey.id, lostMate.id].sort(),
    );
    expect(repo.jobs.get(justQueued.id)?.status).toBe("queued");
    expect(repo.jobs.get(waitingForRunner.id)?.status).toBe("queued");
    expect(release).not.toHaveBeenCalled();
  });

  it("keeps going when the release or the restart of one job fails", async () => {
    const repo = new FakeAgentJobRepo();
    const expired = new Date(NOW.getTime() - 1000);
    const brokenRelease = repo.add({ runtime: "mate", status: "running", attempts: 1, timeoutAt: expired });
    const brokenDispatch = repo.add({ runtime: "ownKey", status: "running", attempts: 1, timeoutAt: expired });
    const healthy = repo.add({ runtime: "ownKey", status: "running", attempts: 1, timeoutAt: expired });
    const lost = repo.add({ runtime: "ownKey", queuedAt: new Date(NOW.getTime() - 5 * 60_000) });
    const releaseFailure = new Error("usage service unavailable");
    const dispatchFailure = new Error("workflow start failed");
    const release = vi.fn().mockRejectedValue(releaseFailure);
    const dispatch = vi.fn().mockImplementation((_id: string, payload: { jobId: string }) => {
      return payload.jobId === brokenDispatch.id ? Promise.reject(dispatchFailure) : Promise.resolve();
    });
    sentry.captureException.mockClear();

    const result = await new SweepAgentJobTimeoutsInteractor(repo, { dispatch }, { release }).invoke({ now: NOW });

    expect(result).toMatchObject({ agentJobsTimedOut: 0, agentJobsRequeued: 3, agentJobsRedispatched: 1 });
    expect(dispatch.mock.calls.map(([, payload]) => (payload as { jobId: string }).jobId)).toEqual([
      brokenRelease.id,
      brokenDispatch.id,
      healthy.id,
      lost.id,
    ]);
    expect(sentry.captureException.mock.calls.map(([error]) => error)).toEqual([releaseFailure, dispatchFailure]);
    // The job whose restart failed is still queued: the next sweep starts it once the grace has passed.
    expect(repo.jobs.get(brokenDispatch.id)).toMatchObject({ status: "queued", queuedAt: NOW });
    const later = new Date(NOW.getTime() + 5 * 60_000);
    dispatch.mockClear();
    dispatch.mockResolvedValue(undefined);
    const next = await new SweepAgentJobTimeoutsInteractor(repo, { dispatch }, { release }).invoke({ now: later });
    expect(next.agentJobsRedispatched).toBe(4);
    expect(dispatch.mock.calls.map(([, payload]) => (payload as { jobId: string }).jobId)).toContain(brokenDispatch.id);
  });
});

describe("jobs that wait in the queue", () => {
  const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
  const sweep = (repo: FakeAgentJobRepo, dispatch = vi.fn().mockResolvedValue(undefined)) =>
    new SweepAgentJobTimeoutsInteractor(repo, { dispatch }, { release: vi.fn() }).invoke({ now: NOW });

  it("end as timed out once they waited longer than the queue allows, on every runtime", async () => {
    const repo = new FakeAgentJobRepo();
    const noRunner = repo.add({ runtime: "runner", queuedAt: minutesAgo(16) });
    const neverStarted = repo.add({ runtime: "ownKey", queuedAt: minutesAgo(20) });
    const waiting = repo.add({ runtime: "runner", queuedAt: minutesAgo(14) });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    const result = await sweep(repo, dispatch);

    expect(result).toMatchObject({ agentJobsExpired: 2, agentJobsRedispatched: 0 });
    expect(repo.jobs.get(noRunner.id)).toMatchObject({ status: "timedOut", error: "queueExpired", finishedAt: NOW });
    expect(repo.jobs.get(neverStarted.id)).toMatchObject({ status: "timedOut", error: "queueExpired" });
    expect(repo.jobs.get(waiting.id)?.status).toBe("queued");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("are free for any live runner again after the runner that claimed them went away", async () => {
    const repo = new FakeAgentJobRepo();
    const RUNNER_A = "00000000-0000-4000-8000-0000000000c1";
    const RUNNER_B = "00000000-0000-4000-8000-0000000000c2";
    const open = repo.add({ runtime: "runner" });
    const pinned = repo.add({ runtime: "runner", pinnedRunnerId: RUNNER_A });
    const claimAs = (runnerId: string, now = minutesAgo(12)) =>
      repo.claimUnscoped({ companyId: COMPANY, runtime: "runner", runnerId, now, timeoutAt: minutesAgo(1) });

    expect(await claimAs(RUNNER_A)).toMatchObject({ id: open.id, runnerId: RUNNER_A, pinnedRunnerId: null });
    expect(await claimAs(RUNNER_A)).toMatchObject({ id: pinned.id, runnerId: RUNNER_A });
    // Runner A crashes: both jobs pass their timeout and the sweep puts them back.
    await sweep(repo);

    expect(repo.jobs.get(open.id)).toMatchObject({ status: "queued", runnerId: null, pinnedRunnerId: null });
    expect(repo.jobs.get(pinned.id)).toMatchObject({ status: "queued", runnerId: null, pinnedRunnerId: RUNNER_A });
    expect(await claimAs(RUNNER_B, NOW)).toMatchObject({ id: open.id, runnerId: RUNNER_B, attempts: 2 });
    expect(await claimAs(RUNNER_B, NOW)).toBeNull();
  });

  it("are cancelled by the sweep when the rule that enqueued them is disabled or deleted", async () => {
    const repo = new FakeAgentJobRepo();
    const RULE_ON = "00000000-0000-4000-8000-0000000000d1";
    const RULE_OFF = "00000000-0000-4000-8000-0000000000d2";
    const kept = repo.add({ runtime: "runner", ruleChain: [RULE_OFF, RULE_ON], queuedAt: minutesAgo(1) });
    const orphaned = repo.add({ runtime: "runner", ruleChain: [RULE_ON, RULE_OFF], queuedAt: minutesAgo(1) });
    const running = repo.add({ runtime: "runner", status: "running", ruleChain: [RULE_OFF] });
    repo.inactiveRuleIds.add(RULE_OFF);

    const result = await sweep(repo);

    expect(result).toMatchObject({ agentJobsCancelled: 1, agentJobsExpired: 0 });
    expect(repo.jobs.get(orphaned.id)).toMatchObject({ status: "cancelled", error: "ruleInactive", finishedAt: NOW });
    expect(repo.jobs.get(kept.id)?.status).toBe("queued");
    expect(repo.jobs.get(running.id)?.status).toBe("running");
  });
});

describe("pruning finished jobs", () => {
  it("removes finished jobs older than the retention and keeps the rest", async () => {
    const repo = new FakeAgentJobRepo();
    const day = 24 * 60 * 60 * 1000;
    const old = repo.add({
      status: "succeeded",
      finishedAt: new Date(NOW.getTime() - (AGENT_JOB_RETENTION_DAYS + 1) * day),
    });
    const recent = repo.add({
      status: "failed",
      finishedAt: new Date(NOW.getTime() - (AGENT_JOB_RETENTION_DAYS - 1) * day),
    });
    const live = repo.add({ status: "running" });

    expect(await new PruneAgentJobsInteractor(repo).invoke({ now: NOW })).toEqual({ pruned: 1 });
    expect(repo.jobs.has(old.id)).toBe(false);
    expect(repo.jobs.has(recent.id)).toBe(true);
    expect(repo.jobs.has(live.id)).toBe(true);
  });
});

describe("discarding a queued job whose owner is gone", () => {
  it("fails only a queued job with the reason", async () => {
    const repo = new FakeAgentJobRepo();
    const queued = repo.add();
    const running = repo.add({ status: "running" });
    const discard = new DiscardAgentJobInteractor(repo, () => NOW);

    expect(await discard.invoke({ jobId: queued.id, companyId: COMPANY, reason: "ownerInactive" })).toEqual({
      discarded: true,
    });
    expect(await discard.invoke({ jobId: running.id, companyId: COMPANY, reason: "ownerInactive" })).toEqual({
      discarded: false,
    });
    expect(repo.jobs.get(queued.id)).toMatchObject({ status: "failed", error: "ownerInactive", finishedAt: NOW });
  });
});
