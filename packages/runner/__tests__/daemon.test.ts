import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../src/api-client.js";
import type { DaemonDeps } from "../src/daemon.js";
import type { RunnerOptions } from "../src/options.js";
import type { ClaimedJob, FoundClient, Logger } from "../src/types.js";

import { backoffDelay, runDaemon } from "../src/daemon.js";

const OPTIONS: RunnerOptions = {
  token: `cmr_${"a".repeat(43)}`,
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

const JOB: ClaimedJob = {
  job: {
    id: "55555555-5555-4555-8555-555555555555",
    prompt: "p",
    promptUntrusted: false,
    timeoutAt: "2026-11-17T10:00:00Z",
  },
  mcp: { url: "https://app.example.test/mcp", token: "t" },
};

type Reply = { status: number; body?: unknown; retryAfterMs?: number | null } | Error;

function reply(value: Reply) {
  if (value instanceof Error) return Promise.reject(value);
  return Promise.resolve({ status: value.status, body: value.body ?? null, retryAfterMs: value.retryAfterMs ?? null });
}

function setup(
  options: { claims?: Reply[]; heartbeats?: Reply[]; clients?: FoundClient[]; stopAfterClaims?: boolean } = {},
) {
  const controller = new AbortController();
  const claims = [...(options.claims ?? [])];
  const heartbeats = [...(options.heartbeats ?? [])];
  const sleeps: number[] = [];
  const warnings: string[] = [];
  const ran: Array<{ job: string; client: string }> = [];
  const heartbeatCalls: Array<{ machine: string; clients: string[] }> = [];

  const heartbeat = vi.fn((machine: string, clients: readonly FoundClient[]) => {
    heartbeatCalls.push({ machine, clients: clients.map((client) => client.name) });
    return reply(heartbeats.shift() ?? { status: 200, body: { ok: true } });
  });
  const claim = vi.fn((): ReturnType<typeof reply> => {
    const next = claims.shift();
    if (!next) {
      controller.abort();
      return reply({ status: 204 });
    }
    return reply(next);
  });
  const api = { heartbeat, claim } as unknown as ApiClient;

  const log: Logger = {
    info: () => undefined,
    warn: (message) => warnings.push(message),
    error: (message) => warnings.push(message),
  };
  const deps: DaemonDeps = {
    api,
    log,
    discover: () => Promise.resolve(options.clients ?? [CLAUDE]),
    runJob: (claimed, client) => {
      ran.push({ job: claimed.job.id, client: client.name });
      return Promise.resolve({ status: "succeeded" });
    },
    sleep: (ms, signal) => {
      sleeps.push(ms);
      return signal.aborted ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 0));
    },
    hostname: "ws-main",
  };
  return { deps, controller, sleeps, warnings, ran, heartbeatCalls, heartbeat, claim };
}

describe("the runner loop", () => {
  it("sends a heartbeat with the host name and the clients found before it takes a job", async () => {
    const { deps, controller, heartbeatCalls, heartbeat, claim } = setup({ clients: [CLAUDE, CODEX] });

    await runDaemon(OPTIONS, deps, controller.signal);

    expect(heartbeatCalls[0]).toEqual({ machine: "ws-main", clients: ["claude", "codex"] });
    expect(heartbeat.mock.invocationCallOrder[0]).toBeLessThan(claim.mock.invocationCallOrder[0]);
  });

  it("runs every claimed job with the first client found and asks again straight away", async () => {
    const { deps, controller, ran, claim } = setup({
      claims: [{ status: 200, body: JOB }, { status: 204 }, { status: 200, body: JOB }],
    });

    const exit = await runDaemon(OPTIONS, deps, controller.signal);

    expect(exit).toBe("stopped");
    expect(ran).toEqual([
      { job: JOB.job.id, client: "claude" },
      { job: JOB.job.id, client: "claude" },
    ]);
    expect(claim).toHaveBeenCalledTimes(4);
  });

  it("uses the client it was asked for and takes no jobs when that one is missing", async () => {
    const codex = setup({ clients: [CLAUDE, CODEX], claims: [{ status: 200, body: JOB }] });
    await runDaemon({ ...OPTIONS, client: "codex" }, codex.deps, codex.controller.signal);
    expect(codex.ran).toEqual([{ job: JOB.job.id, client: "codex" }]);

    const missing = setup({ clients: [CLAUDE], claims: [{ status: 200, body: JOB }] });
    setTimeout(() => missing.controller.abort(), 20);
    await runDaemon({ ...OPTIONS, client: "gemini" }, missing.deps, missing.controller.signal);
    expect(missing.claim).not.toHaveBeenCalled();
    expect(missing.ran).toEqual([]);
    expect(missing.warnings).toContain("no client found on PATH, waiting before taking jobs");
  });

  it("takes no jobs while no client is installed, so another runner can have them", async () => {
    const { deps, controller, claim, warnings } = setup({ clients: [] });
    setTimeout(() => controller.abort(), 20);

    await runDaemon(OPTIONS, deps, controller.signal);

    expect(claim).not.toHaveBeenCalled();
    expect(warnings).toContain("no client found on PATH, waiting before taking jobs");
  });

  it("stops with an unauthorized exit when the server rejects the token on the first heartbeat", async () => {
    const { deps, controller, claim } = setup({ heartbeats: [{ status: 401 }] });

    expect(await runDaemon(OPTIONS, deps, controller.signal)).toBe("unauthorized");
    expect(claim).not.toHaveBeenCalled();
  });

  it("stops with an unauthorized exit when a claim is rejected because the runner was revoked", async () => {
    const { deps, controller, ran } = setup({ claims: [{ status: 401 }] });

    expect(await runDaemon(OPTIONS, deps, controller.signal)).toBe("unauthorized");
    expect(ran).toEqual([]);
  });

  it("backs off after a failing claim, honours Retry-After and starts over after a success", async () => {
    const { deps, controller, sleeps } = setup({
      claims: [
        { status: 503 },
        { status: 502 },
        { status: 429, retryAfterMs: 20_000 },
        { status: 204 },
        { status: 500 },
      ],
    });

    await runDaemon(OPTIONS, deps, controller.signal);

    expect(sleeps.filter((ms) => ms !== OPTIONS.heartbeatMs)).toEqual([1000, 2000, 20_000, 1000]);
  });

  it("keeps going when the server cannot be reached and says so", async () => {
    const { deps, controller, warnings, ran } = setup({
      claims: [new Error("connect ECONNREFUSED"), { status: 200, body: JOB }],
    });

    await runDaemon(OPTIONS, deps, controller.signal);

    expect(warnings).toContain("could not reach the server");
    expect(ran).toHaveLength(1);
  });

  it("keeps the heartbeat going on its own schedule and survives a failing heartbeat", async () => {
    const { deps, controller, heartbeat, claim, warnings } = setup({
      heartbeats: [{ status: 200 }, new Error("timeout"), { status: 500 }, { status: 200 }],
    });
    let polls = 0;
    claim.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      polls += 1;
      if (polls >= 4) controller.abort();
      return { status: 204, body: null, retryAfterMs: null };
    });

    const exit = await runDaemon({ ...OPTIONS, heartbeatMs: 1 }, deps, controller.signal);

    expect(exit).toBe("stopped");
    expect(heartbeat.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(warnings).toContain("heartbeat failed");
    expect(warnings).toContain("heartbeat was not accepted");
  });

  it("stops cleanly when it is told to stop", async () => {
    const { deps, controller } = setup();
    controller.abort();

    expect(await runDaemon(OPTIONS, deps, controller.signal)).toBe("stopped");
  });

  it("passes the stop signal to the job so a running client is stopped too", async () => {
    const { deps, controller } = setup({ claims: [{ status: 200, body: JOB }] });
    const seen: boolean[] = [];
    deps.runJob = (_claimed, _client, signal) => {
      controller.abort();
      seen.push(signal.aborted);
      return Promise.resolve({ status: "failed" as const });
    };

    await runDaemon(OPTIONS, deps, controller.signal);

    expect(seen).toEqual([true]);
  });
});

describe("backoff", () => {
  it("doubles from one second to a ceiling of thirty and never waits less than Retry-After", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((failures) => backoffDelay(failures, null))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
    expect(backoffDelay(1, 12_000)).toBe(12_000);
    expect(backoffDelay(6, 12_000)).toBe(30_000);
  });
});
