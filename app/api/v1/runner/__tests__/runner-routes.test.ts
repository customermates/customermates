import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  claim: vi.fn(),
  events: vi.fn(),
  result: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getHeartbeatAgentRunnerInteractor: () => ({ invoke: interactors.heartbeat }),
  getClaimAgentJobInteractor: () => ({ invoke: interactors.claim }),
  getAppendAgentJobEventsInteractor: () => ({ invoke: interactors.events }),
  getFinishAgentJobInteractor: () => ({ invoke: interactors.result }),
}));

import { POST as postHeartbeat } from "../heartbeat/route";
import { POST as postClaim } from "../jobs/claim/route";
import { POST as postEvents } from "../jobs/[id]/events/route";
import { POST as postResult } from "../jobs/[id]/result/route";

const TOKEN = `cmr_${"a".repeat(43)}`;
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const jobContext = { params: Promise.resolve({ id: JOB_ID }) };

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

beforeEach(() => {
  vi.resetAllMocks();
  interactors.heartbeat.mockResolvedValue({ ok: true, data: { ok: true } });
  interactors.claim.mockResolvedValue({ ok: true, data: null });
  interactors.events.mockResolvedValue({ ok: true, data: { ok: true, accepted: 1 } });
  interactors.result.mockResolvedValue({ ok: true, data: { ok: true } });
});

describe("runner REST routes", () => {
  it("hands the bearer header, a visitor key and the body to the heartbeat interactor", async () => {
    const response = await postHeartbeat(post("heartbeat", { clients: [] }, { "x-real-ip": "203.0.113.9" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const input = interactors.heartbeat.mock.calls[0][0];
    expect(input).toMatchObject({ clients: [], authorization: `Bearer ${TOKEN}` });
    expect(input.visitor).toMatch(/^[0-9a-f]{32}$/u);
  });

  it("lets the header win over an authorization key sent in the body", async () => {
    await postHeartbeat(post("heartbeat", { clients: [], authorization: "Bearer other" }));

    expect(interactors.heartbeat.mock.calls[0][0].authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("answers 200 with the job and 204 without a body when none arrived", async () => {
    interactors.claim.mockResolvedValueOnce({ ok: true, data: { job: { id: JOB_ID }, mcp: { url: "u", token: "t" } } });
    const claimed = await postClaim(post("jobs/claim", {}));
    const none = await postClaim(post("jobs/claim", { waitSeconds: 0 }));

    expect(claimed.status).toBe(200);
    expect(await claimed.json()).toMatchObject({ job: { id: JOB_ID } });
    expect(none.status).toBe(204);
    expect(await none.text()).toBe("");
    expect(interactors.claim.mock.calls[1][0]).toMatchObject({ waitSeconds: 0 });
  });

  it("passes the job id of the path to the events and result interactors", async () => {
    await postEvents(post(`jobs/${JOB_ID}/events`, { events: [{ type: "x" }] }), jobContext);
    await postResult(post(`jobs/${JOB_ID}/result`, { status: "succeeded" }), jobContext);

    expect(interactors.events.mock.calls[0][0]).toMatchObject({ jobId: JOB_ID, events: [{ type: "x" }] });
    expect(interactors.result.mock.calls[0][0]).toMatchObject({ jobId: JOB_ID, status: "succeeded" });
  });

  it("lets the path win over a job id sent in the body", async () => {
    await postResult(post(`jobs/${JOB_ID}/result`, { status: "failed", jobId: "other" }), jobContext);

    expect(interactors.result.mock.calls[0][0].jobId).toBe(JOB_ID);
  });

  it.each([
    [CustomErrorCode.notAuthenticated, "authentication", 401],
    [CustomErrorCode.agentJobNotFound, "not_found", 404],
    [CustomErrorCode.agentJobClosed, "conflict", 409],
    [CustomErrorCode.apiRateLimitReached, "rate_limit", 429],
  ])("answers a %s failure with the structured body and status %i", async (code, kind, status) => {
    interactors.events.mockResolvedValueOnce(failure(code, kind));

    const response = await postEvents(post(`jobs/${JOB_ID}/events`, { events: [{ type: "x" }] }), jobContext);

    expect(response.status).toBe(status);
    expect(StructuredErrorResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it("answers 400 for a body that is not JSON without calling the interactor", async () => {
    const response = await postHeartbeat(post("heartbeat", "{not json"));

    expect(response.status).toBe(400);
    expect(interactors.heartbeat).not.toHaveBeenCalled();
  });
});
