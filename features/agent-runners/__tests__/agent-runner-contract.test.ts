import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import { AGENT_JOB_MAX_WALL_MS } from "@/features/agent-jobs/agent-job.schema";
import { AgentJobResultSchema, AgentTranscriptEventSchema } from "@/features/agent-jobs/agent-job.schema";
import { toAgentJobDetail } from "@/features/agent-jobs/agent-job-dto";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { AppendAgentJobEventsInteractor } from "../append-agent-job-events.interactor";
import { ClaimAgentJobInteractor } from "../claim-agent-job.interactor";
import { FinishAgentJobInteractor } from "../finish-agent-job.interactor";
import { HeartbeatAgentRunnerInteractor } from "../heartbeat-agent-runner.interactor";
import { StartAgentJobInteractor } from "../start-agent-job.interactor";
import { AGENT_RUNNER_LIMITS } from "../agent-runner.schema";

import { COMPANY_ID, JOB_ID, OWNER_ID, RUNNER_ID, admitted, codeOf, statusOf } from "./agent-runner-fixtures";
import { FakeAgentJobCredentials } from "./fake-agent-job-credentials";
import { FakeAgentJobRunnerRepo } from "./fake-agent-job-runner-repo";
import { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const AT = "2026-11-17T09:00:05.000Z";
const OTHER_RUNNER = "99999999-9999-4999-8999-999999999999";
const OTHER_JOB = "88888888-8888-4888-8888-888888888888";
const OTHER_MEMBER = "77777777-7777-4777-8777-777777777777";
const MESSAGE = { type: "message", at: AT, role: "assistant", text: "hello" };

function setup() {
  const runners = new FakeAgentRunnerRepo();
  const jobs = new FakeAgentJobRunnerRepo(() => NOW.getTime());
  const credentials = new FakeAgentJobCredentials();
  runners.addRunner();
  const admission = admitted();
  const request = (body: object = {}) => ({ ...body, admission }) as never;
  const jobRequest = (body: object = {}, jobId = JOB_ID) => ({ ...body, admission, jobId }) as never;
  return { runners, jobs, credentials, request, jobRequest };
}

type Setup = ReturnType<typeof setup>;

describe("heartbeat", () => {
  function heartbeat(s: Setup) {
    return new HeartbeatAgentRunnerInteractor(s.runners, () => NOW);
  }

  it("records the machine and the clients found and answers with the server time", async () => {
    const s = setup();

    const result = await heartbeat(s).invoke(
      s.request({ machine: "ws-main", clients: [{ name: "claude", version: "2.1.0" }] }),
    );

    expect(result).toEqual({
      ok: true,
      data: { ok: true, serverTime: NOW.toISOString(), onlineWithinSeconds: 120 },
    });
    expect(s.runners.heartbeats).toEqual([
      { id: RUNNER_ID, machine: "ws-main", clients: [{ name: "claude", version: "2.1.0" }], at: NOW },
    ]);
  });

  it("accepts a heartbeat without a machine and with no client found", async () => {
    const s = setup();

    expect((await heartbeat(s).invoke(s.request({ clients: [] }))).ok).toBe(true);
    expect(s.runners.heartbeats[0]).toMatchObject({ machine: undefined, clients: [] });
  });

  it("rejects an unknown client, a repeated client, extra keys and a missing client list with 400", async () => {
    const s = setup();
    const bodies = [
      { clients: [{ name: "gpt", version: "1" }] },
      {
        clients: [
          { name: "claude", version: "1" },
          { name: "claude", version: "2" },
        ],
      },
      { clients: [], extra: true },
      {},
    ];

    for (const body of bodies) expect(statusOf(await heartbeat(s).invoke(s.request(body)))).toBe(400);
    expect(s.runners.heartbeats).toEqual([]);
  });

  it("accepts only a runner the admission step produced, never one named in the body", async () => {
    const s = setup();
    const forged = { id: RUNNER_ID, companyId: COMPANY_ID, name: "x", createdById: OWNER_ID };

    for (const admission of [{ runner: forged }, forged, undefined, null])
      expect(statusOf(await heartbeat(s).invoke({ clients: [], admission } as never))).toBe(400);
    expect(s.runners.heartbeats).toEqual([]);
  });
});

describe("claiming a job", () => {
  function claimer(s: Setup, nowMs = { value: NOW.getTime() }) {
    const sleeps: number[] = [];
    const timing = {
      now: () => nowMs.value,
      sleep: (ms: number) => {
        sleeps.push(ms);
        nowMs.value += ms;
        return Promise.resolve();
      },
    };
    return {
      interactor: new ClaimAgentJobInteractor(s.runners, s.jobs, s.credentials, timing),
      sleeps,
      nowMs,
    };
  }

  it("hands out the queued job with its attempt, the MCP url and a key bound to the attempt and the runner", async () => {
    const s = setup();
    s.jobs.addJob({ promptUntrusted: true });
    const { interactor } = claimer(s);

    const result = await interactor.invoke(s.request());

    expect(result).toEqual({
      ok: true,
      data: {
        job: {
          id: JOB_ID,
          attempt: 1,
          prompt: "Summarise the open deals",
          promptUntrusted: true,
          confirmWithinSeconds: 60,
        },
        mcp: { url: `https://app.example.test/api/v1/mcp/w/${COMPANY_ID}`, token: "job-key" },
      },
    });
    expect(s.credentials.issued).toEqual([
      {
        companyId: COMPANY_ID,
        ownerUserId: OWNER_ID,
        jobId: JOB_ID,
        attempt: 1,
        runnerId: RUNNER_ID,
        expiresAt: new Date(
          NOW.getTime() +
            AGENT_RUNNER_LIMITS.claimConfirmMs +
            AGENT_JOB_MAX_WALL_MS +
            AGENT_RUNNER_LIMITS.mcpTokenGraceMs,
        ),
      },
    ]);
    expect(s.jobs.jobs[0]).toMatchObject({ status: "claimed", runnerId: RUNNER_ID, attempts: 1 });
    expect(s.jobs.jobs[0].timeoutAt).toEqual(new Date(NOW.getTime() + AGENT_RUNNER_LIMITS.claimConfirmMs));
    expect(s.runners.touched).toEqual([{ id: RUNNER_ID, at: NOW }]);
  });

  it("never hands a runner the job of another member", async () => {
    const s = setup();
    s.jobs.addJob({ ownerUserId: OTHER_MEMBER });
    const { interactor } = claimer(s);

    const result = await interactor.invoke(s.request({ waitSeconds: 0 }));

    expect(result).toEqual({ ok: true, data: null });
    expect(s.jobs.jobs[0]).toMatchObject({ status: "queued", runnerId: null });
    expect(s.credentials.issued).toEqual([]);
  });

  it("waits for a job that arrives while it polls and returns it", async () => {
    const s = setup();
    const { interactor, sleeps, nowMs } = claimer(s);
    const claim = s.jobs.claimNextForRunner.bind(s.jobs);
    s.jobs.claimNextForRunner = (runner) => {
      if (s.jobs.claimPolls === 2) s.jobs.addJob();
      return claim(runner);
    };

    const result = await interactor.invoke(s.request());

    expect(result.ok && result.data?.job.id).toBe(JOB_ID);
    expect(s.jobs.claimPolls).toBe(3);
    expect(sleeps).toEqual([1500, 1500]);
    expect(nowMs.value).toBe(NOW.getTime() + 3000);
  });

  it("answers with no job once the wait is over and never waits longer than the limit", async () => {
    const s = setup();
    const { interactor, nowMs } = claimer(s);

    const result = await interactor.invoke(s.request());

    expect(result).toEqual({ ok: true, data: null });
    expect(nowMs.value - NOW.getTime()).toBeLessThanOrEqual(AGENT_RUNNER_LIMITS.claimMaxWaitSeconds * 1000);
    expect(s.credentials.issued).toEqual([]);
  });

  it("stops polling and claims nothing once the runner closed the connection", async () => {
    const s = setup();
    const { interactor, sleeps } = claimer(s);
    const controller = new AbortController();
    const claim = s.jobs.claimNextForRunner.bind(s.jobs);
    s.jobs.claimNextForRunner = (runner) => {
      const answer = claim(runner);
      controller.abort();
      s.jobs.addJob();
      return answer;
    };

    const result = await interactor.invoke(s.request({ signal: controller.signal }));

    expect(result).toEqual({ ok: true, data: null });
    expect(s.jobs.claimPolls).toBe(1);
    expect(sleeps).toEqual([1500]);
    expect(s.jobs.jobs[0].status).toBe("queued");
  });

  it("issues no key for a claim whose connection closed while it was taken", async () => {
    const s = setup();
    s.jobs.addJob();
    const { interactor } = claimer(s);
    const controller = new AbortController();
    const claim = s.jobs.claimNextForRunner.bind(s.jobs);
    s.jobs.claimNextForRunner = (runner) => {
      controller.abort();
      return claim(runner);
    };

    const result = await interactor.invoke(s.request({ signal: controller.signal }));

    expect(result).toEqual({ ok: true, data: null });
    expect(s.credentials.issued).toEqual([]);
    expect(s.jobs.jobs[0]).toMatchObject({
      status: "claimed",
      timeoutAt: new Date(NOW.getTime() + AGENT_RUNNER_LIMITS.claimConfirmMs),
    });
  });

  it("honours a shorter wait and polls once for no wait", async () => {
    const s = setup();
    const { interactor, sleeps } = claimer(s);

    expect(await interactor.invoke(s.request({ waitSeconds: 0 }))).toEqual({ ok: true, data: null });
    expect(s.jobs.claimPolls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("rejects a wait above the limit and unknown keys with 400", async () => {
    const s = setup();
    const { interactor } = claimer(s);

    for (const body of [{ waitSeconds: 26 }, { waitSeconds: -1 }, { other: 1 }])
      expect(statusOf(await interactor.invoke(s.request(body)))).toBe(400);
    expect(s.jobs.claimPolls).toBe(0);
  });

  it.each([
    ["ownerInactive", "ownerInactive"],
    ["ownerApiAccess", "ownerApiAccess"],
    ["planRequired", "planRequired"],
  ] as const)("fails the job with %s when no key can be issued, and takes the next one", async (refusal, error) => {
    const s = setup();
    s.jobs.addJob();
    s.credentials.refusal = refusal;
    const { interactor } = claimer(s);

    const result = await interactor.invoke(s.request({ waitSeconds: 0 }));

    expect(result).toEqual({ ok: true, data: null });
    expect(s.jobs.jobs[0]).toMatchObject({ status: "failed" });
    expect(s.jobs.jobs[0].outcome).toMatchObject({ error, result: null });
    expect(s.jobs.claimPolls).toBe(2);
  });
});

describe("confirming a claimed job", () => {
  function starter(s: Setup, now = NOW) {
    return new StartAgentJobInteractor(s.jobs, () => now);
  }

  it("moves the claimed job to running and answers the time that is left", async () => {
    const s = setup();
    s.jobs.addJob({ status: "claimed", runnerId: RUNNER_ID, attempts: 1 });

    const result = await starter(s).invoke(s.jobRequest({ attempt: 1 }));

    expect(result).toEqual({ ok: true, data: { ok: true, timeoutInSeconds: 600 } });
    expect(s.jobs.jobs[0]).toMatchObject({
      status: "running",
      timeoutAt: new Date(NOW.getTime() + AGENT_JOB_MAX_WALL_MS),
    });
  });

  it("answers the remaining time again when the confirmation is repeated", async () => {
    const s = setup();
    s.jobs.addJob({
      status: "running",
      runnerId: RUNNER_ID,
      attempts: 1,
      timeoutAt: new Date(NOW.getTime() + 90_500),
    });

    const result = await starter(s).invoke(s.jobRequest({ attempt: 1 }));

    expect(result).toEqual({ ok: true, data: { ok: true, timeoutInSeconds: 90 } });
  });

  it("answers 409 for an earlier attempt, a requeued job and a closed job", async () => {
    for (const job of [
      { status: "claimed", attempts: 2 },
      { status: "running", attempts: 2 },
      { status: "cancelled", attempts: 1 },
      { status: "timedOut", attempts: 1 },
    ]) {
      const s = setup();
      s.jobs.addJob({ ...job, runnerId: RUNNER_ID });

      const result = await starter(s).invoke(s.jobRequest({ attempt: 1 }));

      expect(statusOf(result)).toBe(409);
      expect(codeOf(result)).toBe(CustomErrorCode.agentJobClosed);
      expect(s.jobs.jobs[0].status).toBe(job.status);
    }
  });

  it("answers 404 for a job of another runner and 400 without an attempt", async () => {
    const s = setup();
    s.jobs.addJob({ status: "claimed", runnerId: OTHER_RUNNER, attempts: 1 });

    expect(statusOf(await starter(s).invoke(s.jobRequest({ attempt: 1 })))).toBe(404);
    expect(statusOf(await starter(s).invoke(s.jobRequest({})))).toBe(400);
    expect(statusOf(await starter(s).invoke(s.jobRequest({ attempt: 0 })))).toBe(400);
    expect(s.jobs.jobs[0].status).toBe("claimed");
  });
});

describe("transcript events", () => {
  function appender(s: Setup) {
    return new AppendAgentJobEventsInteractor(s.jobs);
  }

  it("appends events in the shape the workspace reads and drops unknown keys", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });
    const events = [
      { ...MESSAGE, raw: { secret: "x" } },
      { type: "toolCall", at: AT, toolCallId: "t1", name: "search_crm_records", argumentsDigest: '{"q":"a"}' },
      { type: "toolResult", at: AT, toolCallId: "t1", name: "search_crm_records", ok: true, summary: "3 rows" },
      { type: "finish", at: AT, reason: "stop", text: "Done" },
    ];

    const result = await appender(s).invoke(s.jobRequest({ attempt: 1, events }));

    expect(result).toEqual({ ok: true, data: { ok: true, accepted: 4 } });
    expect(s.jobs.jobs[0].transcript[0]).toEqual(MESSAGE);
    for (const stored of s.jobs.jobs[0].transcript)
      expect(AgentTranscriptEventSchema.safeParse(stored).success).toBe(true);
    const stored = { transcript: s.jobs.jobs[0].transcript, createdAt: NOW, costMicrocents: null };
    expect(toAgentJobDetail(stored as never).transcript).toHaveLength(4);
  });

  it("rejects raw client lines, untyped events, a NUL character and a split surrogate pair with 400", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });
    const bodies = [
      { attempt: 1, events: [{ type: "assistant", message: { content: [] } }] },
      { attempt: 1, events: [{ type: "message", role: "assistant", text: "no time" }] },
      { attempt: 1, events: [{ ...MESSAGE, role: "user" }] },
      { attempt: 1, events: [{ ...MESSAGE, text: "a\u0000b" }] },
      { attempt: 1, events: [{ ...MESSAGE, text: "cut \ud83d" }] },
      { attempt: 1, events: [{ ...MESSAGE, text: "x".repeat(4001) }] },
      { events: [MESSAGE] },
    ];

    for (const body of bodies) expect(statusOf(await appender(s).invoke(s.jobRequest(body)))).toBe(400);
    expect(s.jobs.jobs[0].transcript).toEqual([]);
  });

  it("answers 404 for a job that belongs to no one or to another runner", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: OTHER_RUNNER, attempts: 1 });

    const foreign = await appender(s).invoke(s.jobRequest({ attempt: 1, events: [MESSAGE] }));
    const missing = await appender(s).invoke(s.jobRequest({ attempt: 1, events: [MESSAGE] }, OTHER_JOB));

    expect([statusOf(foreign), statusOf(missing)]).toEqual([404, 404]);
    expect(codeOf(foreign)).toBe(CustomErrorCode.agentJobNotFound);
    expect(s.jobs.jobs[0].transcript).toEqual([]);
  });

  it("answers 409 once the job is finished, timed out, cancelled or queued again", async () => {
    for (const status of ["succeeded", "failed", "timedOut", "cancelled", "queued"]) {
      const s = setup();
      s.jobs.addJob({ status, runnerId: RUNNER_ID, attempts: 1 });

      const result = await appender(s).invoke(s.jobRequest({ attempt: 1, events: [MESSAGE] }));

      expect(statusOf(result)).toBe(409);
      expect(codeOf(result)).toBe(CustomErrorCode.agentJobClosed);
      expect(s.jobs.jobs[0].transcript).toEqual([]);
    }
  });

  it("answers 409 for the events of an earlier attempt of a job that runs again", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 2 });

    const result = await appender(s).invoke(s.jobRequest({ attempt: 1, events: [MESSAGE] }));

    expect(statusOf(result)).toBe(409);
    expect(s.jobs.jobs[0].transcript).toEqual([]);
  });

  it("rejects an empty list, more than 100 events, non-object events and a bad job id with 400", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });
    const tooMany = Array.from({ length: AGENT_RUNNER_LIMITS.maxEventsPerRequest + 1 }, () => MESSAGE);

    for (const events of [[], tooMany, ["text"]])
      expect(statusOf(await appender(s).invoke(s.jobRequest({ attempt: 1, events })))).toBe(400);
    expect(statusOf(await appender(s).invoke(s.jobRequest({ attempt: 1, events: [MESSAGE], extra: 1 })))).toBe(400);
    expect(statusOf(await appender(s).invoke(s.jobRequest({ attempt: 1, events: [MESSAGE] }, "not-a-uuid")))).toBe(400);
  });
});

describe("reporting the result", () => {
  function finisher(s: Setup) {
    return new FinishAgentJobInteractor(s.jobs, s.credentials);
  }

  it("stores a success in the shape the workspace reads, with the server's tool call count and no cost", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });
    s.credentials.used = 7;

    const result = await finisher(s).invoke(
      s.jobRequest({ attempt: 1, status: "succeeded", summary: "Done", inputTokens: 1200, outputTokens: 300 }),
    );

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(s.jobs.jobs[0]).toMatchObject({ status: "succeeded" });
    expect(s.jobs.jobs[0].outcome).toEqual({
      status: "succeeded",
      result: { text: "Done", reason: "stop", toolCalls: 7 },
      inputTokens: 1200,
      outputTokens: 300,
      error: null,
    });
    expect(AgentJobResultSchema.safeParse(s.jobs.jobs[0].outcome?.result).success).toBe(true);
    expect(s.credentials.revoked).toEqual([{ companyId: COMPANY_ID, jobId: JOB_ID, attempt: 1 }]);
  });

  it("stores a failure with its message and a timeout under the code the labels know", async () => {
    const failed = setup();
    failed.jobs.addJob({ status: "claimed", runnerId: RUNNER_ID, attempts: 1 });
    await finisher(failed).invoke(failed.jobRequest({ attempt: 1, status: "failed", error: "claude exited with 1" }));
    expect(failed.jobs.jobs[0].outcome).toMatchObject({
      status: "failed",
      error: "claude exited with 1",
      result: { text: "", reason: "error", toolCalls: 0 },
    });

    const timedOut = setup();
    timedOut.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });
    await finisher(timedOut).invoke(timedOut.jobRequest({ attempt: 1, status: "timedOut" }));
    expect(timedOut.jobs.jobs[0].outcome).toMatchObject({
      status: "timedOut",
      error: "timedOut",
      result: { reason: "timeLimit" },
    });
    expect(timedOut.credentials.revoked).toHaveLength(1);
  });

  it("refuses a cost: a runner job has no Customermates cost", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });

    const result = await finisher(s).invoke(s.jobRequest({ attempt: 1, status: "succeeded", costUsd: 0.01 }));

    expect(statusOf(result)).toBe(400);
    expect(s.jobs.jobs[0].status).toBe("running");
  });

  it("still reports success when revoking the job key fails", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });
    s.credentials.revokeFails = true;

    expect(await finisher(s).invoke(s.jobRequest({ attempt: 1, status: "succeeded" }))).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(s.jobs.jobs[0].status).toBe("succeeded");
  });

  it("answers 409 for a job that is already closed, changes nothing and revokes the attempt's key", async () => {
    const s = setup();
    s.jobs.addJob({ status: "timedOut", runnerId: RUNNER_ID, attempts: 1 });

    const result = await finisher(s).invoke(s.jobRequest({ attempt: 1, status: "succeeded" }));

    expect(statusOf(result)).toBe(409);
    expect(s.jobs.jobs[0].outcome).toBeNull();
    expect(s.credentials.revoked).toEqual([{ companyId: COMPANY_ID, jobId: JOB_ID, attempt: 1 }]);
  });

  it("answers 409 for the late result of an earlier attempt and leaves the running attempt's key alone", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 2 });

    const result = await finisher(s).invoke(s.jobRequest({ attempt: 1, status: "succeeded", summary: "late" }));

    expect(statusOf(result)).toBe(409);
    expect(s.jobs.jobs[0]).toMatchObject({ status: "running", outcome: null });
    expect(s.credentials.revoked).toEqual([{ companyId: COMPANY_ID, jobId: JOB_ID, attempt: 1 }]);
  });

  it("answers 404 for another runner's job and 400 for an invalid result", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: OTHER_RUNNER, attempts: 1 });
    expect(statusOf(await finisher(s).invoke(s.jobRequest({ attempt: 1, status: "succeeded" })))).toBe(404);

    const own = setup();
    own.jobs.addJob({ status: "running", runnerId: RUNNER_ID, attempts: 1 });
    for (const body of [
      { attempt: 1, status: "cancelled" },
      { status: "succeeded" },
      { attempt: 1, status: "succeeded", inputTokens: 1.5 },
      { attempt: 1, status: "succeeded", summary: "x".repeat(AGENT_RUNNER_LIMITS.summaryMaxLength + 1) },
      { attempt: 1, status: "succeeded", summary: "nul\u0000" },
      { attempt: 1, status: "failed", error: "half \udc00" },
      {},
    ])
      expect(statusOf(await finisher(own).invoke(own.jobRequest(body)))).toBe(400);
    expect(own.jobs.jobs[0].status).toBe("running");
  });
});
