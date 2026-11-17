import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FakeServer } from "./fake-server.js";

import { createApiClient } from "../src/api-client.js";
import { runDaemon } from "../src/daemon.js";
import { discoverClients } from "../src/discover.js";
import { createLogger } from "../src/logger.js";
import { runJob } from "../src/run-job.js";
import { sleep } from "../src/sleep.js";

import { startFakeServer } from "./fake-server.js";

const RUNNER_TOKEN = `cmr_${"E".repeat(43)}`;
const JOB_TOKEN = "job-key-e2e-123456";
const JOB_ID = "55555555-5555-4555-8555-555555555555";

const FAKE_CLAUDE = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("2.1.999 (Claude Code)");
  process.exit(0);
}
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  console.log(JSON.stringify({ type: "system", subtype: "init", args, hasRunnerToken: "CUSTOMERMATES_RUNNER_TOKEN" in process.env }));
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "echo " + input } ] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "prompt had " + input.length + " characters", total_cost_usd: 0.01, usage: { input_tokens: 7, output_tokens: 3 } }));
});
`;

let server: FakeServer;
let binDir: string;

beforeEach(async () => {
  server = await startFakeServer();
  binDir = await mkdtemp(join(tmpdir(), "customermates-runner-bin-"));
  const script = join(binDir, "claude");
  await writeFile(script, FAKE_CLAUDE);
  await chmod(script, 0o755);
});

afterEach(async () => {
  await server.close();
  await rm(binDir, { recursive: true, force: true });
});

describe("the runner against a fake server and a real process", () => {
  it("heartbeats, claims a job, runs the client for real, streams events and reports the result", async () => {
    const env = {
      CUSTOMERMATES_RUNNER_CLAUDE_BIN: join(binDir, "claude"),
      CUSTOMERMATES_RUNNER_CODEX_BIN: "no-such-codex",
      CUSTOMERMATES_RUNNER_GEMINI_BIN: "no-such-gemini",
    };
    const options = {
      token: RUNNER_TOKEN,
      url: server.url,
      client: null,
      workdir: null,
      permissionMode: "dontAsk",
      allowedTools: [],
      heartbeatMs: 60_000,
      help: false,
    };
    let claims = 0;
    server.on("/api/v1/runner/heartbeat", { status: 200, body: { ok: true } });
    server.on("/api/v1/runner/jobs/claim", () => {
      claims += 1;
      return claims === 1
        ? {
            status: 200,
            body: {
              job: {
                id: JOB_ID,
                prompt: "Summarise the deals",
                promptUntrusted: false,
                timeoutAt: new Date(Date.now() + 60_000).toISOString(),
              },
              mcp: { url: "https://app.example.test/api/v1/mcp/w/1", token: JOB_TOKEN },
            },
          }
        : { status: 204 };
    });
    server.on(`/api/v1/runner/jobs/${JOB_ID}/events`, { status: 200, body: { ok: true } });
    server.on(`/api/v1/runner/jobs/${JOB_ID}/result`, () => {
      controller.abort();
      return { status: 200, body: { ok: true } };
    });
    const controller = new AbortController();
    const logs: string[] = [];
    const log = createLogger([RUNNER_TOKEN, JOB_TOKEN], (line) => logs.push(line));
    const api = createApiClient({ baseUrl: server.url, token: RUNNER_TOKEN });
    const previous = process.env.CUSTOMERMATES_RUNNER_TOKEN;
    process.env.CUSTOMERMATES_RUNNER_TOKEN = RUNNER_TOKEN;

    try {
      const exit = await runDaemon(
        options,
        {
          api,
          log,
          discover: () => discoverClients(env),
          runJob: (claimed, client, signal) => runJob(claimed, client, options, { api, log, signal, flushMs: 10 }),
          sleep,
          hostname: "test-host",
        },
        controller.signal,
      );
      expect(exit).toBe("stopped");
    } finally {
      if (previous === undefined) delete process.env.CUSTOMERMATES_RUNNER_TOKEN;
      else process.env.CUSTOMERMATES_RUNNER_TOKEN = previous;
    }

    const heartbeat = server.requests.find((request) => request.path.endsWith("/heartbeat"));
    expect(heartbeat?.body).toEqual({ machine: "test-host", clients: [{ name: "claude", version: "2.1.999" }] });
    expect(heartbeat?.headers.authorization).toBe(`Bearer ${RUNNER_TOKEN}`);

    const events = server.requests
      .filter((request) => request.path.endsWith("/events"))
      .flatMap((request) => (request.body as { events: Array<Record<string, unknown>> }).events);
    expect(events.map((event) => event.type)).toEqual(["system", "assistant", "result"]);
    expect(events[0]).toMatchObject({ hasRunnerToken: false });
    expect((events[0].args as string[]).slice(0, 5)).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--mcp-config",
    ]);

    const result = server.requests.find((request) => request.path.endsWith("/result"));
    expect(result?.body).toEqual({
      status: "succeeded",
      summary: "prompt had 19 characters",
      inputTokens: 7,
      outputTokens: 3,
      costUsd: 0.01,
    });
    expect(JSON.stringify([server.requests.map((request) => request.body), logs])).not.toContain(JOB_TOKEN);
  });
});
