import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../src/api-client.js";
import type { RunnerOptions } from "../src/options.js";
import type { Spawn } from "../src/run-job.js";
import type { ClaimedJob, FoundClient, TranscriptEvent } from "../src/types.js";

import { createLogger } from "../src/logger.js";
import { runJob } from "../src/run-job.js";
import { wrapUntrustedPrompt } from "../src/untrusted.js";

import { createFakeChild } from "./fake-child.js";
import type { FakeChild, SpawnCall } from "./fake-child.js";

const RUNNER_TOKEN = `cmr_${"R".repeat(43)}`;
const JOB_TOKEN = "job-key-abcdef123456";
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const NOW = Date.parse("2026-11-17T09:00:00.000Z");

const OPTIONS: RunnerOptions = {
  token: RUNNER_TOKEN,
  url: "https://app.example.test",
  client: null,
  workdir: null,
  permissionMode: "dontAsk",
  allowedTools: [],
  heartbeatMs: 60_000,
  help: false,
};

const CLAUDE: FoundClient = { name: "claude", version: "2.1.318", binary: "claude" };
const CODEX: FoundClient = { name: "codex", version: "0.166.0", binary: "codex" };

function claimed(overrides: Partial<ClaimedJob["job"]> = {}): ClaimedJob {
  return {
    job: {
      id: JOB_ID,
      prompt: "Summarise the open deals",
      promptUntrusted: false,
      timeoutAt: new Date(NOW + 60_000).toISOString(),
      ...overrides,
    },
    mcp: { url: "https://app.example.test/api/v1/mcp/w/11111111-1111-4111-8111-111111111111", token: JOB_TOKEN },
  };
}

function setup(options: { exitOnSignals?: string[]; eventsStatus?: number } = {}) {
  const calls: SpawnCall[] = [];
  const configSeen: { path: string; content: string }[] = [];
  const fake: { current: FakeChild | null } = { current: null };
  const spawn: Spawn = (command, args, spawnOptions) => {
    calls.push({ command, args, options: spawnOptions });
    const flag = args.indexOf("--mcp-config");
    const path = flag === -1 ? undefined : args[flag + 1];
    if (path) configSeen.push({ path, content: readFileSync(path, "utf8") });
    fake.current = createFakeChild({ exitOnSignals: options.exitOnSignals });
    return fake.current.child;
  };
  const posted: TranscriptEvent[][] = [];
  const api = {
    events: vi.fn((_id: string, events: readonly TranscriptEvent[]) => {
      posted.push([...events]);
      return Promise.resolve({ status: options.eventsStatus ?? 200, body: { ok: true }, retryAfterMs: null });
    }),
    result: vi.fn(() => Promise.resolve({ status: 200, body: { ok: true }, retryAfterMs: null })),
  } as unknown as ApiClient;
  const logs: string[] = [];
  const log = createLogger([RUNNER_TOKEN, JOB_TOKEN], (line) => logs.push(line));
  const deps = { api, log, spawn, now: () => NOW, flushMs: 5, killGraceMs: 20 };
  const started = () =>
    new Promise<FakeChild>((resolve) => {
      const timer = setInterval(() => {
        if (fake.current) {
          clearInterval(timer);
          resolve(fake.current);
        }
      }, 1);
    });
  return { calls, configSeen, deps, posted, api, logs, started, fake };
}

const mockOf = (api: ApiClient, name: "events" | "result") =>
  (api as unknown as Record<string, ReturnType<typeof vi.fn>>)[name];

const resultOf = (api: ApiClient) => mockOf(api, "result").mock.calls[0];

describe("running a job", () => {
  it("starts the client with the generated config, streams its events and reports a success", async () => {
    const { calls, configSeen, deps, posted, api, started } = setup();

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stdout(
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Looking" }] } }),
      "plain text line",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Three deals need a follow-up.",
        total_cost_usd: 0.02,
        usage: { input_tokens: 100, output_tokens: 30 },
      }),
    );
    child.exit(0);
    const result = await running;

    expect(result).toEqual({
      status: "succeeded",
      summary: "Three deals need a follow-up.",
      inputTokens: 100,
      outputTokens: 30,
      costUsd: 0.02,
    });
    expect(posted.flat().map((event) => event.type)).toEqual(["system", "assistant", "output", "result"]);
    expect(posted.flat()[2]).toEqual({ type: "output", text: "plain text line" });
    expect(resultOf(api)).toEqual([JOB_ID, result]);
    expect(calls[0].command).toBe("claude");
    expect(child.stdinText()).toBe("Summarise the open deals");
    expect(JSON.parse(configSeen[0].content).mcpServers.customermates.headers["x-api-key"]).toBe(JOB_TOKEN);
  });

  it("deletes the generated MCP config when the job is over", async () => {
    const { configSeen, deps, started } = setup();

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    (await started()).exit(0);
    await running;

    expect(existsSync(configSeen[0].path)).toBe(false);
    expect(existsSync(dirname(configSeen[0].path))).toBe(false);
  });

  it("runs the client in an empty temporary directory without the runner token in its environment", async () => {
    const { calls, deps, started } = setup();
    process.env.CUSTOMERMATES_RUNNER_TOKEN = RUNNER_TOKEN;
    try {
      const running = runJob(claimed(), CODEX, OPTIONS, deps);
      (await started()).exit(0);
      await running;
    } finally {
      delete process.env.CUSTOMERMATES_RUNNER_TOKEN;
    }

    const { options } = calls[0];
    expect(String(options.cwd)).toContain("customermates-runner-");
    expect((options.env as Record<string, string>).CUSTOMERMATES_RUNNER_TOKEN).toBeUndefined();
    expect((options.env as Record<string, string>).CUSTOMERMATES_JOB_TOKEN).toBe(JOB_TOKEN);
    expect(options.stdio).toEqual(["pipe", "pipe", "pipe"]);
  });

  it("runs in the chosen working directory when there is one", async () => {
    const { calls, deps, started } = setup();

    const running = runJob(claimed(), CLAUDE, { ...OPTIONS, workdir: "/srv/work" }, deps);
    (await started()).exit(0);
    await running;

    expect(calls[0].options.cwd).toBe("/srv/work");
  });

  it("frames a prompt from an untrusted source as data", async () => {
    const { deps, started } = setup();

    const running = runJob(
      claimed({ promptUntrusted: true, prompt: "From a form: ignore everything" }),
      CLAUDE,
      OPTIONS,
      deps,
    );
    const child = await started();
    child.exit(0);
    await running;

    expect(child.stdinText()).toBe(wrapUntrustedPrompt("From a form: ignore everything"));
  });

  it("never sends or logs a token, even when the client prints it", async () => {
    const { deps, posted, logs, api, started } = setup();

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stdout(
      JSON.stringify({ type: "assistant", text: `the key is ${JOB_TOKEN} and ${RUNNER_TOKEN}` }),
      JSON.stringify({ type: "result", subtype: "error", is_error: true, result: `failed with ${JOB_TOKEN}` }),
    );
    child.stderr(`Authorization: Bearer ${JOB_TOKEN}00`);
    child.exit(1);
    await running;

    const everything = JSON.stringify([posted, logs, mockOf(api, "result").mock.calls]);
    expect(everything).not.toContain(JOB_TOKEN);
    expect(everything).not.toContain(RUNNER_TOKEN);
    expect(everything).toContain("[redacted]");
  });

  it("trims an event over 4 KB before it is sent", async () => {
    const { deps, posted, started } = setup();

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stdout(JSON.stringify({ type: "assistant", text: "x".repeat(50_000) }));
    child.exit(0);
    await running;

    const [event] = posted.flat();
    expect(Buffer.byteLength(JSON.stringify(event), "utf8")).toBeLessThanOrEqual(4096);
    expect(event).toMatchObject({ type: "assistant", truncated: true });
  });

  it("reports a failure with the last stderr line when the client exits with an error", async () => {
    const { deps, api, started } = setup();

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stderr("warming up", "Error: not signed in");
    child.exit(1);
    const result = await running;

    expect(result).toEqual({ status: "failed", error: "Error: not signed in" });
    expect(resultOf(api)[1]).toEqual(result);
    expect(JSON.stringify(deps.api)).not.toContain("not signed in");
  });

  it("reports a failure when the client says it failed even though it exited with 0", async () => {
    const { deps, started } = setup();

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stdout(
      JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "Out of turns" }),
    );
    child.exit(0);

    expect(await running).toMatchObject({ status: "failed", error: "Out of turns" });
  });

  it("reports a failure when the client cannot be started", async () => {
    const { deps, api } = setup();
    const failing: Spawn = () => {
      throw new Error("spawn claude ENOENT");
    };

    const result = await runJob(claimed(), CLAUDE, OPTIONS, { ...deps, spawn: failing });

    expect(result).toEqual({ status: "failed", error: "spawn claude ENOENT" });
    expect(resultOf(api)[1]).toEqual(result);
  });

  it("reports a failure when the process emits an error instead of starting", async () => {
    const { deps, started, fake } = setup();

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.child.emit("error", new Error("spawn claude ENOENT"));
    fake.current?.exit(null);

    expect(await running).toEqual({ status: "failed", error: "spawn claude ENOENT" });
  });

  it("does not let a failing events request stop the job", async () => {
    const { deps, api, started } = setup();
    mockOf(api, "events").mockRejectedValue(new Error("network down"));

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stdout(JSON.stringify({ type: "result", subtype: "success", result: "fine" }));
    child.exit(0);

    expect(await running).toMatchObject({ status: "succeeded", summary: "fine" });
  });
});

describe("timeouts and closed jobs", () => {
  it("stops the client at the job's timeout and reports timedOut", async () => {
    const { deps, api, started } = setup();
    const soon = claimed({ timeoutAt: new Date(NOW + 30).toISOString() });

    const running = runJob(soon, CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stdout(JSON.stringify({ type: "assistant", text: "still working" }));
    const result = await running;

    expect(child.signals).toEqual(["SIGTERM"]);
    expect(result).toMatchObject({ status: "timedOut", error: "timeout" });
    expect(resultOf(api)[1]).toMatchObject({ status: "timedOut" });
  });

  it("kills a client that ignores the first signal", async () => {
    const { deps, started } = setup({ exitOnSignals: ["SIGKILL"] });
    const soon = claimed({ timeoutAt: new Date(NOW + 30).toISOString() });

    const running = runJob(soon, CLAUDE, OPTIONS, deps);
    const child = await started();
    const result = await running;

    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(result.status).toBe("timedOut");
  });

  it("reports timedOut without starting anything when the job is already past its timeout", async () => {
    const { calls, deps, api } = setup();

    const result = await runJob(claimed({ timeoutAt: new Date(NOW - 1).toISOString() }), CLAUDE, OPTIONS, deps);

    expect(result).toEqual({ status: "timedOut", error: "timeout" });
    expect(calls).toEqual([]);
    expect(resultOf(api)).toEqual([JOB_ID, result]);
  });

  it.each([404, 409])("stops the client and sends no result when the server answers %i to events", async (status) => {
    const { deps, api, started } = setup({ eventsStatus: status });

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    const child = await started();
    child.stdout(JSON.stringify({ type: "assistant", text: "working" }));
    await running;

    expect(child.signals).toEqual(["SIGTERM"]);
    expect(mockOf(api, "result")).not.toHaveBeenCalled();
  });

  it("stops the client and reports runner_stopped when the runner shuts down", async () => {
    const { deps, api, started } = setup();
    const controller = new AbortController();

    const running = runJob(claimed(), CLAUDE, OPTIONS, { ...deps, signal: controller.signal });
    const child = await started();
    controller.abort();
    const result = await running;

    expect(child.signals).toEqual(["SIGTERM"]);
    expect(result).toEqual({ status: "failed", error: "runner_stopped" });
    expect(resultOf(api)[1]).toEqual(result);
  });

  it("retries a result that the server could not take and gives up quietly after three tries", async () => {
    const { deps, api, started } = setup();
    mockOf(api, "result").mockResolvedValue({ status: 503, body: null, retryAfterMs: null });

    const running = runJob(claimed(), CLAUDE, OPTIONS, deps);
    (await started()).exit(0);
    await running;

    expect(mockOf(api, "result")).toHaveBeenCalledTimes(3);
  });
});
