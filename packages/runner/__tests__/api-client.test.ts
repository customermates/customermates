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
      job: { id: JOB_ID, attempt: 1, prompt: "p", promptUntrusted: false, confirmWithinSeconds: 60 },
      mcp: { url: "https://app/mcp", token: "t" },
    };
    server.on("/api/v1/runner/jobs/claim", { status: 200, body: claimed });
    expect(await client().claim()).toEqual({ status: 200, body: claimed, retryAfterMs: null });

    server.on("/api/v1/runner/jobs/claim", { status: 204 });
    expect(await client().claim()).toEqual({ status: 204, body: null, retryAfterMs: null });
    expect(server.requests[0].body).toEqual({});
  });

  it("confirms a job and posts events and the result to the job's own paths, each with the attempt", async () => {
    const event = { type: "message" as const, at: "2026-11-17T09:00:00.000Z", role: "assistant" as const, text: "a" };
    server.on(`/api/v1/runner/jobs/${JOB_ID}/start`, { status: 200, body: { ok: true, timeoutInSeconds: 600 } });
    server.on(`/api/v1/runner/jobs/${JOB_ID}/events`, { status: 200, body: { ok: true, accepted: 1 } });
    server.on(`/api/v1/runner/jobs/${JOB_ID}/result`, { status: 200, body: { ok: true } });

    const started = await client().start(JOB_ID, 2);
    await client().events(JOB_ID, 2, [event]);
    await client().result(JOB_ID, 2, { status: "succeeded", summary: "done", inputTokens: 3 });

    expect(started.body).toEqual({ ok: true, timeoutInSeconds: 600 });
    expect(server.requests.map((request) => [request.path, request.body])).toEqual([
      [`/api/v1/runner/jobs/${JOB_ID}/start`, { attempt: 2 }],
      [`/api/v1/runner/jobs/${JOB_ID}/events`, { attempt: 2, events: [event] }],
      [`/api/v1/runner/jobs/${JOB_ID}/result`, { attempt: 2, status: "succeeded", summary: "done", inputTokens: 3 }],
    ]);
  });

  it("declares the length of every body, which the server requires before it reads one", async () => {
    const event = { type: "message" as const, at: "2026-11-17T09:00:00.000Z", role: "assistant" as const, text: "ä" };
    for (const path of [
      "heartbeat",
      "jobs/claim",
      `jobs/${JOB_ID}/start`,
      `jobs/${JOB_ID}/events`,
      `jobs/${JOB_ID}/result`,
    ])
      server.on(`/api/v1/runner/${path}`, { status: 200, body: { ok: true } });

    await client().heartbeat("ws-main", []);
    await client().claim();
    await client().start(JOB_ID, 1);
    await client().events(JOB_ID, 1, [event]);
    await client().result(JOB_ID, 1, { status: "succeeded" });

    expect(server.requests).toHaveLength(5);
    for (const request of server.requests) {
      expect(request.headers["transfer-encoding"]).toBeUndefined();
      expect(request.headers["content-length"]).toBe(String(Buffer.byteLength(JSON.stringify(request.body))));
    }
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
