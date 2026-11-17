import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import { AGENT_MICROCENTS_PER_USD } from "@/core/commercial/agent-credits";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { AppendAgentJobEventsInteractor, trimAgentJobEvent } from "../append-agent-job-events.interactor";
import { ClaimAgentJobInteractor } from "../claim-agent-job.interactor";
import { FinishAgentJobInteractor } from "../finish-agent-job.interactor";
import { HeartbeatAgentRunnerInteractor } from "../heartbeat-agent-runner.interactor";
import { AGENT_RUNNER_LIMITS } from "../agent-runner.schema";

import {
  COMPANY_ID,
  JOB_ID,
  OWNER_ID,
  RUNNER_ID,
  bearer,
  codeOf,
  makeAuthenticator,
  statusOf,
} from "./agent-runner-fixtures";
import { FakeAgentJobCredentials } from "./fake-agent-job-credentials";
import { FakeAgentJobRunnerRepo } from "./fake-agent-job-runner-repo";
import { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const OTHER_RUNNER = "99999999-9999-4999-8999-999999999999";
const OTHER_JOB = "88888888-8888-4888-8888-888888888888";

function setup() {
  const runners = new FakeAgentRunnerRepo();
  const jobs = new FakeAgentJobRunnerRepo(() => NOW.getTime());
  const credentials = new FakeAgentJobCredentials();
  const { token } = runners.addRunner();
  const authenticator = makeAuthenticator(runners);
  const request = (body: Record<string, unknown> = {}) => ({ authorization: bearer(token), ...body });
  const jobRequest = (body: Record<string, unknown> = {}, jobId = JOB_ID) => ({ ...request(body), jobId });
  return { runners, jobs, credentials, authenticator, token, request, jobRequest };
}

type Setup = ReturnType<typeof setup>;

describe("heartbeat", () => {
  function heartbeat(s: Setup) {
    return new HeartbeatAgentRunnerInteractor(s.authenticator, s.runners, () => NOW);
  }

  it("records the machine and the clients found and answers with the server time", async () => {
    const s = setup();

    const result = await heartbeat(s).invoke(
      s.request({ machine: "ws-main", clients: [{ name: "claude", version: "2.1.0" }] }) as never,
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

    expect((await heartbeat(s).invoke(s.request({ clients: [] }) as never)).ok).toBe(true);
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

    for (const body of bodies) expect(statusOf(await heartbeat(s).invoke(s.request(body) as never))).toBe(400);
    expect(s.runners.heartbeats).toEqual([]);
  });

  it("answers 401 without recording anything for a bad token", async () => {
    const s = setup();

    const result = await heartbeat(s).invoke({ authorization: "Bearer nope", clients: [] });

    expect(statusOf(result)).toBe(401);
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
      interactor: new ClaimAgentJobInteractor(s.authenticator, s.runners, s.jobs, s.credentials, timing),
      sleeps,
      nowMs,
    };
  }

  it("hands out the queued job with the workspace MCP url and a token that expires after the job", async () => {
    const s = setup();
    s.jobs.addJob({ promptUntrusted: true });
    const { interactor } = claimer(s);

    const result = await interactor.invoke(s.request() as never);

    const timeoutAt = new Date(NOW.getTime() + s.jobs.jobTimeoutMs);
    expect(result).toEqual({
      ok: true,
      data: {
        job: {
          id: JOB_ID,
          prompt: "Summarise the open deals",
          promptUntrusted: true,
          timeoutAt: timeoutAt.toISOString(),
        },
        mcp: { url: `https://app.example.test/api/v1/mcp/w/${COMPANY_ID}`, token: "job-key" },
      },
    });
    expect(s.credentials.issued).toEqual([
      {
        companyId: COMPANY_ID,
        ownerUserId: OWNER_ID,
        jobId: JOB_ID,
        expiresAt: new Date(timeoutAt.getTime() + AGENT_RUNNER_LIMITS.mcpTokenGraceMs),
      },
    ]);
    expect(s.jobs.jobs[0]).toMatchObject({ status: "claimed", runnerId: RUNNER_ID, attempts: 1 });
    expect(s.runners.touched).toEqual([{ id: RUNNER_ID, at: NOW }]);
  });

  it("waits for a job that arrives while it polls and returns it", async () => {
    const s = setup();
    const { interactor, sleeps, nowMs } = claimer(s);
    const claim = s.jobs.claimNextForRunner.bind(s.jobs);
    s.jobs.claimNextForRunner = (runner) => {
      if (s.jobs.claimPolls === 2) s.jobs.addJob();
      return claim(runner);
    };

    const result = await interactor.invoke(s.request() as never);

    expect(result.ok && result.data?.job.id).toBe(JOB_ID);
    expect(s.jobs.claimPolls).toBe(3);
    expect(sleeps).toEqual([1500, 1500]);
    expect(nowMs.value).toBe(NOW.getTime() + 3000);
  });

  it("answers with no job once the wait is over and never waits longer than the limit", async () => {
    const s = setup();
    const { interactor, nowMs } = claimer(s);

    const result = await interactor.invoke(s.request() as never);

    expect(result).toEqual({ ok: true, data: null });
    expect(nowMs.value - NOW.getTime()).toBeLessThanOrEqual(AGENT_RUNNER_LIMITS.claimMaxWaitSeconds * 1000);
    expect(s.credentials.issued).toEqual([]);
  });

  it("honours a shorter wait and polls once for no wait", async () => {
    const s = setup();
    const { interactor, sleeps } = claimer(s);

    expect(await interactor.invoke(s.request({ waitSeconds: 0 }) as never)).toEqual({ ok: true, data: null });
    expect(s.jobs.claimPolls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("rejects a wait above the limit and unknown keys with 400", async () => {
    const s = setup();
    const { interactor } = claimer(s);

    for (const body of [{ waitSeconds: 26 }, { waitSeconds: -1 }, { other: 1 }])
      expect(statusOf(await interactor.invoke(s.request(body) as never))).toBe(400);
    expect(s.jobs.claimPolls).toBe(0);
  });

  it("fails the job and gives out nothing when its owner can no longer be used", async () => {
    const s = setup();
    s.jobs.addJob();
    s.credentials.available = false;
    const { interactor } = claimer(s);

    const result = await interactor.invoke(s.request({ waitSeconds: 0 }) as never);

    expect(result).toEqual({ ok: true, data: null });
    expect(s.jobs.jobs[0]).toMatchObject({ status: "failed" });
    expect(s.jobs.jobs[0].outcome).toMatchObject({ error: "owner_unavailable", result: null });
  });

  it("answers 401 before it claims anything for a revoked runner", async () => {
    const s = setup();
    s.jobs.addJob();
    s.runners.markRevoked(RUNNER_ID, NOW);
    const { interactor } = claimer(s);

    expect(statusOf(await interactor.invoke(s.request() as never))).toBe(401);
    expect(s.jobs.jobs[0].status).toBe("queued");
  });
});

describe("transcript events", () => {
  function appender(s: Setup) {
    return new AppendAgentJobEventsInteractor(s.authenticator, s.jobs);
  }

  it("appends the events of the runner's active job", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID });
    const events = [{ type: "system" }, { type: "assistant", text: "hello" }];

    const result = await appender(s).invoke(s.jobRequest({ events }) as never);

    expect(result).toEqual({ ok: true, data: { ok: true, accepted: 2 } });
    expect(s.jobs.jobs[0].transcript).toEqual(events);
  });

  it("replaces an event over 4 KB with a marker that says how large it was", () => {
    const big = { type: "assistant", text: "x".repeat(AGENT_RUNNER_LIMITS.eventMaxBytes) };

    expect(trimAgentJobEvent(big)).toEqual({
      type: "truncated",
      bytes: Buffer.byteLength(JSON.stringify(big), "utf8"),
    });
    expect(trimAgentJobEvent({ type: "ok" })).toEqual({ type: "ok" });
  });

  it("measures the size in bytes, so multi-byte text is trimmed as the runner trims it", () => {
    const wide = { text: "ä".repeat(AGENT_RUNNER_LIMITS.eventMaxBytes / 2) };

    expect(JSON.stringify(wide).length).toBeLessThan(AGENT_RUNNER_LIMITS.eventMaxBytes);
    expect(trimAgentJobEvent(wide)).toMatchObject({ type: "truncated" });
  });

  it("answers 404 for a job that belongs to no one or to another runner", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: OTHER_RUNNER });

    const foreign = await appender(s).invoke(s.jobRequest({ events: [{ type: "x" }] }) as never);
    const missing = await appender(s).invoke(s.jobRequest({ events: [{ type: "x" }] }, OTHER_JOB) as never);

    expect([statusOf(foreign), statusOf(missing)]).toEqual([404, 404]);
    expect(codeOf(foreign)).toBe(CustomErrorCode.agentJobNotFound);
    expect(s.jobs.jobs[0].transcript).toEqual([]);
  });

  it("answers 409 once the job is finished, timed out, cancelled or not yet claimed", async () => {
    for (const status of ["succeeded", "failed", "timedOut", "cancelled", "queued"]) {
      const s = setup();
      s.jobs.addJob({ status, runnerId: RUNNER_ID });

      const result = await appender(s).invoke(s.jobRequest({ events: [{ type: "x" }] }) as never);

      expect(statusOf(result)).toBe(409);
      expect(codeOf(result)).toBe(CustomErrorCode.agentJobClosed);
      expect(s.jobs.jobs[0].transcript).toEqual([]);
    }
  });

  it("rejects an empty list, more than 100 events, non-object events and a bad job id with 400", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID });
    const tooMany = Array.from({ length: AGENT_RUNNER_LIMITS.maxEventsPerRequest + 1 }, () => ({ type: "x" }));

    for (const body of [{ events: [] }, { events: tooMany }, { events: ["text"] }, { events: [{}], extra: 1 }])
      expect(statusOf(await appender(s).invoke(s.jobRequest(body) as never))).toBe(400);
    expect(statusOf(await appender(s).invoke(s.jobRequest({ events: [{}] }, "not-a-uuid") as never))).toBe(400);
  });
});

describe("reporting the result", () => {
  function finisher(s: Setup) {
    return new FinishAgentJobInteractor(s.authenticator, s.jobs, s.credentials);
  }

  it("stores a success with its summary, tokens and cost and revokes the job token", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID });

    const result = await finisher(s).invoke(
      s.jobRequest({
        status: "succeeded",
        summary: "Done",
        inputTokens: 1200,
        outputTokens: 300,
        costUsd: 0.0125,
      }) as never,
    );

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(s.jobs.jobs[0]).toMatchObject({ status: "succeeded" });
    expect(s.jobs.jobs[0].outcome).toEqual({
      status: "succeeded",
      result: { summary: "Done" },
      inputTokens: 1200,
      outputTokens: 300,
      costMicrocents: Math.round(0.0125 * AGENT_MICROCENTS_PER_USD),
      error: null,
    });
    expect(s.credentials.revoked).toEqual([{ companyId: COMPANY_ID, jobId: JOB_ID }]);
  });

  it("stores a failure with its message and a timeout with a default one", async () => {
    const failed = setup();
    failed.jobs.addJob({ status: "claimed", runnerId: RUNNER_ID });
    await finisher(failed).invoke(failed.jobRequest({ status: "failed", error: "claude exited with 1" }) as never);
    expect(failed.jobs.jobs[0].outcome).toMatchObject({
      status: "failed",
      error: "claude exited with 1",
      result: null,
    });

    const timedOut = setup();
    timedOut.jobs.addJob({ status: "running", runnerId: RUNNER_ID });
    await finisher(timedOut).invoke(timedOut.jobRequest({ status: "timedOut" }) as never);
    expect(timedOut.jobs.jobs[0].outcome).toMatchObject({ status: "timedOut", error: "timeout" });
    expect(timedOut.credentials.revoked).toHaveLength(1);
  });

  it("still reports success when revoking the job token fails", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: RUNNER_ID });
    s.credentials.revokeFails = true;

    expect(await finisher(s).invoke(s.jobRequest({ status: "succeeded" }) as never)).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(s.jobs.jobs[0].status).toBe("succeeded");
  });

  it("answers 409 for a job that is already closed and changes nothing", async () => {
    const s = setup();
    s.jobs.addJob({ status: "timedOut", runnerId: RUNNER_ID });

    const result = await finisher(s).invoke(s.jobRequest({ status: "succeeded" }) as never);

    expect(statusOf(result)).toBe(409);
    expect(s.jobs.jobs[0].outcome).toBeNull();
    expect(s.credentials.revoked).toEqual([]);
  });

  it("answers 404 for another runner's job and 400 for an invalid result", async () => {
    const s = setup();
    s.jobs.addJob({ status: "running", runnerId: OTHER_RUNNER });
    expect(statusOf(await finisher(s).invoke(s.jobRequest({ status: "succeeded" }) as never))).toBe(404);

    const own = setup();
    own.jobs.addJob({ status: "running", runnerId: RUNNER_ID });
    for (const body of [
      { status: "cancelled" },
      { status: "succeeded", costUsd: -1 },
      { status: "succeeded", inputTokens: 1.5 },
      { status: "succeeded", summary: "x".repeat(AGENT_RUNNER_LIMITS.summaryMaxLength + 1) },
      {},
    ])
      expect(statusOf(await finisher(own).invoke(own.jobRequest(body) as never))).toBe(400);
    expect(own.jobs.jobs[0].status).toBe("running");
  });
});
