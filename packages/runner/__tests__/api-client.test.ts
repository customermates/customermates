import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FakeServer } from "./fake-server.js";

import { createApiClient } from "../src/api-client.js";

import { startFakeServer } from "./fake-server.js";

const TOKEN = `cmr_${"a".repeat(43)}`;
const JOB_ID = "55555555-5555-4555-8555-555555555555";

let server: FakeServer;

beforeEach(async () => {
  server = await startFakeServer();
});

afterEach(() => server.close());

function client() {
  return createApiClient({ baseUrl: server.url, token: TOKEN, version: "9.9.9" });
}

describe("runner API client", () => {
  it("sends a heartbeat with the bearer token, the machine and only name and version of each client", async () => {
    server.on("/api/v1/runner/heartbeat", { status: 200, body: { ok: true } });

    const response = await client().heartbeat("ws-main", [
      { name: "claude", version: "2.1.0", binary: "/usr/bin/claude" },
    ]);

    expect(response).toEqual({ status: 200, body: { ok: true }, retryAfterMs: null });
    const [request] = server.requests;
    expect(request.method).toBe("POST");
    expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers["user-agent"]).toBe("customermates-runner/9.9.9");
    expect(request.body).toEqual({ machine: "ws-main", clients: [{ name: "claude", version: "2.1.0" }] });
  });

  it("returns the claimed job on 200 and no body on 204", async () => {
    const claimed = {
      job: { id: JOB_ID, prompt: "p", promptUntrusted: false, timeoutAt: "2026-11-17T10:00:00.000Z" },
      mcp: { url: "https://app/mcp", token: "t" },
    };
    server.on("/api/v1/runner/jobs/claim", { status: 200, body: claimed });
    expect(await client().claim()).toEqual({ status: 200, body: claimed, retryAfterMs: null });

    server.on("/api/v1/runner/jobs/claim", { status: 204 });
    expect(await client().claim()).toEqual({ status: 204, body: null, retryAfterMs: null });
    expect(server.requests[0].body).toEqual({});
  });

  it("posts events and the result to the job's own paths", async () => {
    server.on(`/api/v1/runner/jobs/${JOB_ID}/events`, { status: 200, body: { ok: true, accepted: 2 } });
    server.on(`/api/v1/runner/jobs/${JOB_ID}/result`, { status: 200, body: { ok: true } });

    await client().events(JOB_ID, [{ type: "a" }, { type: "b" }]);
    await client().result(JOB_ID, { status: "succeeded", summary: "done", inputTokens: 3 });

    expect(server.requests.map((request) => [request.path, request.body])).toEqual([
      [`/api/v1/runner/jobs/${JOB_ID}/events`, { events: [{ type: "a" }, { type: "b" }] }],
      [`/api/v1/runner/jobs/${JOB_ID}/result`, { status: "succeeded", summary: "done", inputTokens: 3 }],
    ]);
  });

  it("reports the status and Retry-After of a refusal without throwing", async () => {
    server.on("/api/v1/runner/heartbeat", { status: 429, body: { error: {} }, headers: { "retry-after": "7" } });
    expect(await client().heartbeat("m", [])).toMatchObject({ status: 429, retryAfterMs: 7000 });

    server.on("/api/v1/runner/heartbeat", { status: 401, body: { error: { kind: "authentication" } } });
    expect(await client().heartbeat("m", [])).toMatchObject({ status: 401, retryAfterMs: null });
  });

  it("returns a null body for an answer that is not JSON", async () => {
    server.on("/api/v1/runner/jobs/claim", () => ({ status: 502 }));

    expect(await client().claim()).toMatchObject({ status: 502, body: null });
  });

  it("gives up on a request when its signal aborts", async () => {
    server.on("/api/v1/runner/jobs/claim", { status: 204 });
    const controller = new AbortController();
    controller.abort();

    await expect(client().claim(controller.signal)).rejects.toThrow();
  });
});
