import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { AGENT_RUNNER_LIMITS } from "@/features/agent-runners/agent-runner.schema";

const interactors = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  claim: vi.fn(),
  start: vi.fn(),
  events: vi.fn(),
  result: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getHeartbeatAgentRunnerInteractor: () => ({ invoke: interactors.heartbeat }),
  getClaimAgentJobInteractor: () => ({ invoke: interactors.claim }),
  getStartAgentJobInteractor: () => ({ invoke: interactors.start }),
  getAppendAgentJobEventsInteractor: () => ({ invoke: interactors.events }),
  getFinishAgentJobInteractor: () => ({ invoke: interactors.result }),
}));

import { POST as postHeartbeat } from "../heartbeat/route";
import { POST as postClaim } from "../jobs/claim/route";
import { POST as postEvents } from "../jobs/[id]/events/route";
import { POST as postResult } from "../jobs/[id]/result/route";
import { POST as postStart } from "../jobs/[id]/start/route";

const TOKEN = `cmr_${"a".repeat(43)}`;
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const jobContext = { params: Promise.resolve({ id: JOB_ID }) };

type Input = {
  authorization: string | null;
  visitor: string | null;
  jobId?: string;
  readBody: () => Promise<unknown>;
  signal?: AbortSignal;
};

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

function readingBody<T>(answer: T) {
  return async (input: Input) => {
    await input.readBody();
    return answer;
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  interactors.heartbeat.mockResolvedValue({ ok: true, data: { ok: true } });
  interactors.claim.mockResolvedValue({ ok: true, data: null });
  interactors.start.mockResolvedValue({ ok: true, data: { ok: true, timeoutInSeconds: 600 } });
  interactors.events.mockResolvedValue({ ok: true, data: { ok: true, accepted: 1 } });
  interactors.result.mockResolvedValue({ ok: true, data: { ok: true } });
});

describe("runner REST routes", () => {
  it("hands the bearer header, a visitor key and a body reader to the heartbeat interactor", async () => {
    const response = await postHeartbeat(post("heartbeat", { clients: [] }, { "x-real-ip": "203.0.113.9" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const input = interactors.heartbeat.mock.calls[0][0] as Input;
    expect(input.authorization).toBe(`Bearer ${TOKEN}`);
    expect(input.visitor).toMatch(/^[0-9a-f]{32}$/u);
    expect(await input.readBody()).toEqual({ clients: [] });
  });

  it("does not read the body unless the interactor asks for it, so a bad token costs no parsing", async () => {
    interactors.heartbeat.mockResolvedValueOnce(failure(CustomErrorCode.notAuthenticated, "authentication"));
    const request = post("heartbeat", "{not json");

    const response = await postHeartbeat(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  });

  it("never lets the body set the credentials or the job id", async () => {
    await postResult(post(`jobs/${JOB_ID}/result`, { authorization: "Bearer other", jobId: "other" }), jobContext);

    const input = interactors.result.mock.calls[0][0] as Input;
    expect(input.authorization).toBe(`Bearer ${TOKEN}`);
    expect(input.jobId).toBe(JOB_ID);
  });

  it("answers 200 with the job and 204 without a body when none arrived, and hands over the abort signal", async () => {
    interactors.claim.mockResolvedValueOnce({ ok: true, data: { job: { id: JOB_ID }, mcp: { url: "u", token: "t" } } });
    const claimed = await postClaim(post("jobs/claim", {}));
    const none = await postClaim(post("jobs/claim", { waitSeconds: 0 }));

    expect(claimed.status).toBe(200);
    expect(await claimed.json()).toMatchObject({ job: { id: JOB_ID } });
    expect(none.status).toBe(204);
    expect(await none.text()).toBe("");
    const input = interactors.claim.mock.calls[1][0] as Input;
    expect(await input.readBody()).toEqual({ waitSeconds: 0 });
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes the job id of the path to the start, events and result interactors", async () => {
    const started = await postStart(post(`jobs/${JOB_ID}/start`, { attempt: 1 }), jobContext);
    await postEvents(post(`jobs/${JOB_ID}/events`, { attempt: 1, events: [] }), jobContext);
    await postResult(post(`jobs/${JOB_ID}/result`, { attempt: 1, status: "succeeded" }), jobContext);

    expect(await started.json()).toEqual({ ok: true, timeoutInSeconds: 600 });
    for (const mock of [interactors.start, interactors.events, interactors.result])
      expect((mock.mock.calls[0][0] as Input).jobId).toBe(JOB_ID);
    expect(await (interactors.start.mock.calls[0][0] as Input).readBody()).toEqual({ attempt: 1 });
  });

  it.each([
    [CustomErrorCode.notAuthenticated, "authentication", 401],
    [CustomErrorCode.agentJobNotFound, "not_found", 404],
    [CustomErrorCode.agentJobClosed, "conflict", 409],
    [CustomErrorCode.apiRateLimitReached, "rate_limit", 429],
  ])("answers a %s failure with the structured body and status %i", async (code, kind, status) => {
    interactors.events.mockResolvedValueOnce(failure(code, kind));

    const response = await postEvents(post(`jobs/${JOB_ID}/events`, { attempt: 1, events: [] }), jobContext);

    expect(response.status).toBe(status);
    expect(StructuredErrorResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it("answers 400 for a body that is not JSON once the interactor reads it", async () => {
    interactors.heartbeat.mockImplementation(readingBody({ ok: true, data: { ok: true } }));

    const response = await postHeartbeat(post("heartbeat", "{not json"));

    expect(response.status).toBe(400);
  });

  it("reads an empty body as an empty object", async () => {
    await postClaim(post("jobs/claim", ""));

    expect(await (interactors.claim.mock.calls[0][0] as Input).readBody()).toEqual({});
  });

  it("answers 413 for a body over the cap, declared or streamed, without parsing it", async () => {
    interactors.events.mockImplementation(readingBody({ ok: true, data: { ok: true, accepted: 0 } }));
    const oversized = JSON.stringify({ padding: "x".repeat(AGENT_RUNNER_LIMITS.maxBodyBytes) });

    const declared = await postEvents(post(`jobs/${JOB_ID}/events`, oversized), jobContext);
    const streamed = await postEvents(post(`jobs/${JOB_ID}/events`, oversized, { "content-length": "10" }), jobContext);

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
    expect(StructuredErrorResponseSchema.safeParse(await declared.json()).success).toBe(true);
  });
});
