import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { AgentRunnerAdmission } from "@/features/agent-runners/agent-runner-admission";
import { AdmittedAgentRunner } from "@/features/agent-runners/agent-runner.schema";

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  heartbeat: vi.fn(),
  claim: vi.fn(),
  start: vi.fn(),
  events: vi.fn(),
  result: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getAgentRunnerAdmission: () => ({ admit: mocks.admit }),
  getHeartbeatAgentRunnerInteractor: () => ({ invoke: mocks.heartbeat }),
  getClaimAgentJobInteractor: () => ({ invoke: mocks.claim }),
  getStartAgentJobInteractor: () => ({ invoke: mocks.start }),
  getAppendAgentJobEventsInteractor: () => ({ invoke: mocks.events }),
  getFinishAgentJobInteractor: () => ({ invoke: mocks.result }),
}));

import { POST as postHeartbeat } from "../heartbeat/route";
import { POST as postClaim } from "../jobs/claim/route";
import { POST as postEvents } from "../jobs/[id]/events/route";
import { POST as postResult } from "../jobs/[id]/result/route";
import { POST as postStart } from "../jobs/[id]/start/route";

const TOKEN = `cmr_${"a".repeat(43)}`;
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const jobContext = { params: Promise.resolve({ id: JOB_ID }) };
const ADMITTED = new AdmittedAgentRunner({
  id: "44444444-4444-4444-8444-444444444444",
  companyId: "11111111-1111-4111-8111-111111111111",
  name: "Office laptop",
  createdById: "33333333-3333-4333-8333-333333333333",
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:4105/api/v1/runner/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function failure(code: CustomErrorCode, kind: string) {
  return { ok: false, error: createZodError(code, [], { error: code, kind }) };
}

const routes = [
  ["heartbeat", (request: NextRequest) => postHeartbeat(request), mocks.heartbeat],
  ["jobs/claim", (request: NextRequest) => postClaim(request), mocks.claim],
  [`jobs/${JOB_ID}/start`, (request: NextRequest) => postStart(request, jobContext), mocks.start],
  [`jobs/${JOB_ID}/events`, (request: NextRequest) => postEvents(request, jobContext), mocks.events],
  [`jobs/${JOB_ID}/result`, (request: NextRequest) => postResult(request, jobContext), mocks.result],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admit.mockResolvedValue({ ok: true, admission: ADMITTED });
  mocks.heartbeat.mockResolvedValue({ ok: true, data: { ok: true } });
  mocks.claim.mockResolvedValue({ ok: true, data: null });
  mocks.start.mockResolvedValue({ ok: true, data: { ok: true, timeoutInSeconds: 600 } });
  mocks.events.mockResolvedValue({ ok: true, data: { ok: true, accepted: 1 } });
  mocks.result.mockResolvedValue({ ok: true, data: { ok: true } });
});

describe("runner REST routes", () => {
  it("admits the runner with the bearer header, a visitor key and the declared body size", async () => {
    const headers = { "x-real-ip": "203.0.113.9", "content-length": "14" };
    const response = await postHeartbeat(post("heartbeat", { clients: [] }, headers));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const admission = mocks.admit.mock.calls[0][0] as Record<string, string>;
    expect(admission.authorization).toBe(`Bearer ${TOKEN}`);
    expect(admission.visitor).toMatch(/^[0-9a-f]{32}$/u);
    expect(admission.contentLength).toBe("14");
    expect(mocks.heartbeat.mock.calls[0][0]).toEqual({ clients: [], admission: ADMITTED });
  });

  it.each(routes)("answers 401 on %s for an unknown token without reading the body", async (path, call, interactor) => {
    mocks.admit.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    const request = post(path, "{not json");

    const response = await call(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(StructuredErrorResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ error: { kind: "authentication" } });
    expect(request.bodyUsed).toBe(false);
    expect(interactor).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After when the runner is rate limited, without reading the body", async () => {
    mocks.admit.mockResolvedValue({ ok: false, reason: "rateLimited", retryAfterSeconds: 9 });
    const request = post("jobs/claim", {});

    const response = await postClaim(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("9");
    const body = (await response.json()) as { error: { kind: string; issues: Array<{ message: string }> } };
    expect(body.error.kind).toBe("rate_limit");
    expect(body.error.issues[0].message).toBe("Too many runner requests. Retry in 9 seconds.");
    expect(body.error.issues[0].message).not.toMatch(/Free plan|upgrade/iu);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that declares more than the cap, without reading it", async () => {
    mocks.admit.mockResolvedValue({ ok: false, reason: "bodyTooLarge" });
    const request = post(`jobs/${JOB_ID}/events`, { attempt: 1, events: [] });

    const response = await postEvents(request, jobContext);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { issues: Array<{ message: string }> } };
    expect(body.error.issues[0].message).toBe("The request body is larger than 512 KB.");
    expect(request.bodyUsed).toBe(false);
    expect(mocks.events).not.toHaveBeenCalled();
  });

  it.each(routes)(
    "answers 400 on %s for a streamed body of any size without reading a byte",
    async (path, call, interactor) => {
      const admission = new AgentRunnerAdmission({
        authenticate: () => Promise.resolve({ ok: true, runner: ADMITTED.runner }),
      });
      mocks.admit.mockImplementation((request: Parameters<AgentRunnerAdmission["admit"]>[0]) =>
        admission.admit(request),
      );
      let pulled = 0;
      const endless = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulled += 1;
            controller.enqueue(new Uint8Array(64 * 1024).fill(32));
          },
        },
        { highWaterMark: 0 },
      );
      const request = new NextRequest(`http://localhost:4105/api/v1/runner/${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: endless,
        duplex: "half",
      } as ConstructorParameters<typeof NextRequest>[1]);

      const response = await call(request);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { issues: Array<{ message: string }> } };
      expect(body.error.issues[0].message).toContain("Content-Length");
      expect(request.bodyUsed).toBe(false);
      expect(pulled).toBe(0);
      expect(interactor).not.toHaveBeenCalled();
    },
  );

  it("reads a body whose declared length is within the cap", async () => {
    const admission = new AgentRunnerAdmission({
      authenticate: () => Promise.resolve({ ok: true, runner: ADMITTED.runner }),
    });
    mocks.admit.mockImplementation((request: Parameters<AgentRunnerAdmission["admit"]>[0]) => admission.admit(request));

    const response = await postHeartbeat(post("heartbeat", { clients: [] }, { "content-length": "14" }));

    expect(response.status).toBe(200);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1);
  });

  it("never lets the body name the admitted runner or the job id", async () => {
    const forged = { status: "succeeded", attempt: 1, admission: { runner: { id: "other" } }, jobId: "other" };

    await postResult(post(`jobs/${JOB_ID}/result`, forged), jobContext);

    const input = mocks.result.mock.calls[0][0] as { admission: unknown; jobId: string };
    expect(input.admission).toBe(ADMITTED);
    expect(input.jobId).toBe(JOB_ID);
  });

  it("answers 200 with the job and 204 without a body when none arrived, and hands over the abort signal", async () => {
    mocks.claim.mockResolvedValueOnce({ ok: true, data: { job: { id: JOB_ID }, mcp: { url: "u", token: "t" } } });
    const claimed = await postClaim(post("jobs/claim", {}));
    const none = await postClaim(post("jobs/claim", { waitSeconds: 0 }));

    expect(claimed.status).toBe(200);
    expect(await claimed.json()).toMatchObject({ job: { id: JOB_ID } });
    expect(none.status).toBe(204);
    expect(await none.text()).toBe("");
    const input = mocks.claim.mock.calls[1][0] as { waitSeconds: number; signal: unknown; admission: unknown };
    expect(input.waitSeconds).toBe(0);
    expect(input.signal).toBeInstanceOf(AbortSignal);
    expect(input.admission).toBe(ADMITTED);
  });

  it("passes the job id of the path to the start, events and result interactors", async () => {
    const started = await postStart(post(`jobs/${JOB_ID}/start`, { attempt: 1 }), jobContext);
    await postEvents(post(`jobs/${JOB_ID}/events`, { attempt: 1, events: [] }), jobContext);
    await postResult(post(`jobs/${JOB_ID}/result`, { attempt: 1, status: "succeeded" }), jobContext);

    expect(await started.json()).toEqual({ ok: true, timeoutInSeconds: 600 });
    expect(mocks.start.mock.calls[0][0]).toEqual({ attempt: 1, jobId: JOB_ID, admission: ADMITTED });
    expect(mocks.events.mock.calls[0][0]).toMatchObject({ attempt: 1, events: [], jobId: JOB_ID });
    expect(mocks.result.mock.calls[0][0]).toMatchObject({ attempt: 1, status: "succeeded", jobId: JOB_ID });
  });

  it.each([
    [CustomErrorCode.agentJobNotFound, "not_found", 404],
    [CustomErrorCode.agentJobClosed, "conflict", 409],
  ])("answers a %s failure with the structured body and status %i", async (code, kind, status) => {
    mocks.events.mockResolvedValueOnce(failure(code, kind));

    const response = await postEvents(post(`jobs/${JOB_ID}/events`, { attempt: 1, events: [] }), jobContext);

    expect(response.status).toBe(status);
    expect(StructuredErrorResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it("answers 400 for a body that is not JSON without calling the interactor", async () => {
    const response = await postHeartbeat(post("heartbeat", "{not json"));

    expect(response.status).toBe(400);
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
});
