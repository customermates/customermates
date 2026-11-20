import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RunnerOptions } from "../src/options.js";
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
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("2.1.999 (Claude Code)");
  process.exit(0);
}
const pidFile = process.env.FAKE_CLAUDE_HELPER_PID_FILE;
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  if (pidFile) {
    const helper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" });
    writeFileSync(pidFile, String(helper.pid));
  }
  const facts = { args, cwd: process.cwd(), hasRunnerToken: "CUSTOMERMATES_RUNNER_TOKEN" in process.env };
  console.log(JSON.stringify({ type: "system", subtype: "init" }));
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: JSON.stringify(facts) }, { type: "tool_use", id: "toolu_1", name: "mcp__customermates__search_crm_records", input: { query: input } }] } }));
  console.log(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "2 records" }] }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "prompt had " + input.length + " characters", total_cost_usd: 0.01, usage: { input_tokens: 7, output_tokens: 3 } }));
  if (pidFile) process.exit(0);
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

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runOneJob(helperPidFile?: string) {
  const env = {
    CUSTOMERMATES_RUNNER_CLAUDE_BIN: join(binDir, "claude"),
    CUSTOMERMATES_RUNNER_CODEX_BIN: "no-such-codex",
    CUSTOMERMATES_RUNNER_GEMINI_BIN: "no-such-gemini",
  };
  const options: RunnerOptions = {
    token: RUNNER_TOKEN,
    tokenOnCommandLine: false,
    url: server.url,
    client: null,
    workdir: null,
    permissionMode: "dontAsk",
    settingSources: "project",
    allowedTools: [],
    allowShell: false,
    heartbeatMs: 60_000,
    help: false,
  };
  let claims = 0;
  const controller = new AbortController();
  server.on("/api/v1/runner/heartbeat", { status: 200, body: { ok: true, serverTime: new Date().toISOString() } });
  server.on("/api/v1/runner/jobs/claim", () => {
    claims += 1;
    return claims === 1
      ? {
          status: 200,
          body: {
            job: {
              id: JOB_ID,
              attempt: 1,
              prompt: "Summarise the deals",
              promptUntrusted: false,
              confirmWithinSeconds: 60,
            },
            mcp: { url: "https://app.example.test/api/v1/mcp/w/1", token: JOB_TOKEN },
          },
        }
      : { status: 204 };
  });
  server.on(`/api/v1/runner/jobs/${JOB_ID}/start`, { status: 200, body: { ok: true, timeoutInSeconds: 60 } });
  server.on(`/api/v1/runner/jobs/${JOB_ID}/events`, { status: 200, body: { ok: true } });
  server.on(`/api/v1/runner/jobs/${JOB_ID}/result`, () => {
    controller.abort();
    return { status: 200, body: { ok: true } };
  });
  const logs: string[] = [];
  const log = createLogger([RUNNER_TOKEN, JOB_TOKEN], (line) => logs.push(line));
  const api = createApiClient({ baseUrl: server.url, token: RUNNER_TOKEN });
  const previousToken = process.env.CUSTOMERMATES_RUNNER_TOKEN;
  process.env.CUSTOMERMATES_RUNNER_TOKEN = RUNNER_TOKEN;
  if (helperPidFile) process.env.FAKE_CLAUDE_HELPER_PID_FILE = helperPidFile;

  try {
    const exit = await runDaemon(
      options,
      {
        api,
        log,
        discover: () => discoverClients(env),
        runJob: (claimed, client, signal) =>
          runJob(claimed, client, options, { api, log, signal, flushMs: 10, drainMs: 200 }),
        sleep,
        hostname: "test-host",
      },
      controller.signal,
    );
    expect(exit).toBe("stopped");
  } finally {
    delete process.env.FAKE_CLAUDE_HELPER_PID_FILE;
    if (previousToken === undefined) delete process.env.CUSTOMERMATES_RUNNER_TOKEN;
    else process.env.CUSTOMERMATES_RUNNER_TOKEN = previousToken;
  }
  return { logs };
}

function bodiesOf<T>(suffix: string): T[] {
  return server.requests.filter((request) => request.path.endsWith(suffix)).map((request) => request.body as T);
}

describe("the runner against a fake server and a real process", () => {
  it("heartbeats, claims and confirms a job, runs the client for real, streams typed events and reports the result", async () => {
    const { logs } = await runOneJob();

    const heartbeat = server.requests.find((request) => request.path.endsWith("/heartbeat"));
    expect(heartbeat?.body).toEqual({ machine: "test-host", clients: [{ name: "claude", version: "2.1.999" }] });
    expect(heartbeat?.headers.authorization).toBe(`Bearer ${RUNNER_TOKEN}`);
    expect(bodiesOf("/start")).toEqual([{ attempt: 1 }]);

    const batches = bodiesOf<{ attempt: number; events: Array<Record<string, unknown>> }>("/events");
    expect(batches.every((batch) => batch.attempt === 1)).toBe(true);
    const events = batches.flatMap((batch) => batch.events);
    expect(events.map((event) => event.type)).toEqual(["message", "toolCall", "toolResult", "finish"]);
    expect(events[1]).toMatchObject({
      toolCallId: "toolu_1",
      name: "mcp__customermates__search_crm_records",
      argumentsDigest: '{"query":"Summarise the deals"}',
    });
    expect(events[2]).toMatchObject({ toolCallId: "toolu_1", ok: true, summary: "2 records" });
    expect(events[3]).toMatchObject({ reason: "stop", text: "prompt had 19 characters" });

    const facts = JSON.parse(String(events[0].text)) as { args: string[]; cwd: string; hasRunnerToken: boolean };
    expect(facts.hasRunnerToken).toBe(false);
    expect(facts.cwd).toContain("customermates-work-");
    expect(facts.args).toContain("--strict-mcp-config");
    expect(facts.args[facts.args.indexOf("--setting-sources") + 1]).toBe("project");
    expect(facts.args.slice(0, 5)).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--mcp-config"]);

    expect(bodiesOf("/result")).toEqual([
      { attempt: 1, status: "succeeded", summary: "prompt had 19 characters", inputTokens: 7, outputTokens: 3 },
    ]);
    expect(JSON.stringify([server.requests.map((request) => request.body), logs])).not.toContain(JOB_TOKEN);
  });

  it.skipIf(process.platform === "win32")(
    "finishes although the client left a helper behind that keeps its output open, and stops the helper",
    async () => {
      const pidFile = join(binDir, "helper.pid");

      await runOneJob(pidFile);

      const helperPid = Number(await readFile(pidFile, "utf8"));
      expect(bodiesOf("/result")).toEqual([
        { attempt: 1, status: "succeeded", summary: "prompt had 19 characters", inputTokens: 7, outputTokens: 3 },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(alive(helperPid)).toBe(false);
    },
    15_000,
  );
});
