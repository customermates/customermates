import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { Readable } from "node:stream";
import type { ApiClient } from "./api-client.js";
import type { RunnerOptions } from "./options.js";
import type { ClaimedJob, FoundClient, JobResult, Logger, Outcome, TranscriptEvent } from "./types.js";

import { spawn as nodeSpawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { CLIENT_ADAPTERS } from "./clients/index.js";
import { redactText, redactValue } from "./redact.js";
import { trimEvent } from "./trim-event.js";
import { promptFor } from "./untrusted.js";

export type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export type RunJobDeps = {
  api: ApiClient;
  log: Logger;
  spawn?: Spawn;
  now?: () => number;
  flushMs?: number;
  killGraceMs?: number;
  signal?: AbortSignal;
};

const FLUSH_BATCH = 20;
const MAX_EVENTS = 5000;
const STDERR_TAIL = 20;
const ERROR_MAX = 500;
const RESULT_ATTEMPTS = 3;
const TOKEN_ENV_NAMES = ["CUSTOMERMATES_RUNNER_TOKEN"];

function childEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const kept = Object.entries({ ...process.env, ...extra }).filter(([name]) => !TOKEN_ENV_NAMES.includes(name));
  return { ...Object.fromEntries(kept), NODE_ENV: process.env.NODE_ENV ?? "production" };
}

function lineEvent(line: string): TranscriptEvent {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as TranscriptEvent;
  } catch {
    return { type: "output", text: line };
  }
  return { type: "output", text: line };
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runJob(
  claimed: ClaimedJob,
  client: FoundClient,
  options: RunnerOptions,
  deps: RunJobDeps,
): Promise<JobResult> {
  const { job, mcp } = claimed;
  const spawn = deps.spawn ?? (nodeSpawn as Spawn);
  const now = deps.now ?? (() => Date.now());
  const flushMs = deps.flushMs ?? 1000;
  const killGraceMs = deps.killGraceMs ?? 5000;
  const secrets = [options.token, mcp.token];
  const adapter = CLIENT_ADAPTERS[client.name];
  const observer = adapter.createObserver();
  const log: Logger = {
    info: (message, fields) => deps.log.info(message, { job: job.id, ...fields }),
    warn: (message, fields) => deps.log.warn(message, { job: job.id, ...fields }),
    error: (message, fields) => deps.log.error(message, { job: job.id, ...fields }),
  };

  const remainingMs = Date.parse(job.timeoutAt) - now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    const result: JobResult = { status: "timedOut", error: "timeout" };
    await report(job.id, result, deps.api, log);
    return result;
  }

  const configDir = await mkdtemp(join(tmpdir(), "customermates-runner-"));
  let closed = false;
  let timedOut = false;
  let stopped = false;
  let stderrLines: string[] = [];
  let eventCount = 0;
  let pending: TranscriptEvent[] = [];
  let sending: Promise<void> = Promise.resolve();
  let flushTimer: NodeJS.Timeout | null = null;
  let child: ChildProcess | null = null;
  let killTimer: NodeJS.Timeout | null = null;

  const terminate = (reason: "timeout" | "closed" | "shutdown") => {
    if (reason === "timeout") timedOut = true;
    else stopped = true;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => child?.kill("SIGKILL"), killGraceMs);
  };

  const sendBatch = async (batch: TranscriptEvent[]) => {
    try {
      const response = await deps.api.events(job.id, batch);
      if (response.status === 404 || response.status === 409) {
        closed = true;
        log.warn("server closed the job, stopping the client", { status: response.status });
        terminate("closed");
      } else if (response.status === 401) terminate("shutdown");
      else if (response.status >= 400) log.warn("events were not accepted", { status: response.status });
    } catch (error) {
      log.warn("could not send events", { error: redactText(String(error), secrets) });
    }
  };

  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    if (pending.length === 0) return sending;
    const batch = pending;
    pending = [];
    sending = sending.then(() => sendBatch(batch));
    return sending;
  };

  const push = (event: TranscriptEvent) => {
    if (eventCount >= MAX_EVENTS) return;
    eventCount += 1;
    const safe = eventCount === MAX_EVENTS ? { type: "transcript_limit", limit: MAX_EVENTS } : event;
    pending.push(trimEvent(redactValue(safe, secrets) as TranscriptEvent));
    if (pending.length >= FLUSH_BATCH) void flush();
    else flushTimer ??= setTimeout(() => void flush(), flushMs);
  };

  const abortListener = () => terminate("shutdown");
  deps.signal?.addEventListener("abort", abortListener, { once: true });
  const timeoutTimer = setTimeout(() => terminate("timeout"), remainingMs);

  let exitCode: number | null = null;
  let startFailure: string | null = null;
  try {
    const invocation = adapter.prepare({
      prompt: promptFor(job.prompt, job.promptUntrusted),
      mcp,
      options,
      configDir,
    });
    for (const file of invocation.files) await writeFile(join(configDir, file.name), file.content, { mode: 0o600 });
    const cwd = options.workdir ?? join(configDir, "work");
    if (!options.workdir) await mkdir(cwd, { recursive: true });

    log.info("starting client", { client: client.name, version: client.version });
    child = spawn(client.binary, invocation.args, {
      cwd,
      env: childEnvironment({ ...invocation.env }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const running = child;

    const exited = new Promise<number | null>((resolve) => {
      running.once("error", (error) => {
        stderrLines.push(String(error.message));
        resolve(null);
      });
      running.once("close", (code) => resolve(code));
    });

    const streamDone = (stream: Readable | null, onLine: (line: string) => void) =>
      new Promise<void>((resolve) => {
        if (!stream) return resolve();
        const lines = createInterface({ input: stream });
        lines.on("line", (line) => {
          if (line.trim()) onLine(line);
        });
        lines.once("close", () => resolve());
      });
    const stdoutDone = streamDone(running.stdout, (line) => {
      const event = lineEvent(line);
      observer.observe(event);
      push(event);
    });
    const stderrDone = streamDone(running.stderr, (line) => {
      stderrLines = [...stderrLines, line].slice(-STDERR_TAIL);
      push({ type: "stderr", text: line });
    });
    running.stdin?.on("error", () => undefined);
    running.stdin?.end(invocation.stdin ?? "");
    if (timedOut) terminate("timeout");
    else if (stopped) terminate("shutdown");

    [exitCode] = await Promise.all([exited, stdoutDone, stderrDone]);
  } catch (error) {
    startFailure = redactText(error instanceof Error ? error.message : String(error), secrets);
  } finally {
    clearTimeout(timeoutTimer);
    if (killTimer) clearTimeout(killTimer);
    deps.signal?.removeEventListener("abort", abortListener);
    await flush();
    await rm(configDir, { recursive: true, force: true });
  }

  const result = resultOf(observer.outcome(), { exitCode, timedOut, stopped, stderrLines, secrets, startFailure });
  log.info("client finished", { status: result.status, exitCode });
  if (!closed) await report(job.id, result, deps.api, log);
  return result;
}

function resultOf(
  outcome: Outcome,
  context: {
    exitCode: number | null;
    timedOut: boolean;
    stopped: boolean;
    stderrLines: string[];
    secrets: string[];
    startFailure: string | null;
  },
): JobResult {
  const tokens = {
    ...(outcome.inputTokens === undefined ? {} : { inputTokens: outcome.inputTokens }),
    ...(outcome.outputTokens === undefined ? {} : { outputTokens: outcome.outputTokens }),
    ...(outcome.costUsd === undefined ? {} : { costUsd: outcome.costUsd }),
  };
  const summary =
    outcome.summary === undefined ? {} : { summary: redactText(outcome.summary, context.secrets).slice(0, 20_000) };
  if (context.timedOut) return { status: "timedOut", error: "timeout", ...summary, ...tokens };
  if (context.stopped) return { status: "failed", error: "runner_stopped", ...summary, ...tokens };
  const failed = context.startFailure !== null || outcome.isError || context.exitCode !== 0;
  if (!failed) return { status: "succeeded", ...summary, ...tokens };
  const reason =
    context.startFailure ??
    outcome.errorText ??
    context.stderrLines.at(-1) ??
    (context.exitCode === null ? "the client could not be started" : `the client exited with code ${context.exitCode}`);
  return {
    status: "failed",
    error: redactText(reason, context.secrets).slice(0, ERROR_MAX),
    ...summary,
    ...tokens,
  };
}

async function report(jobId: string, result: JobResult, api: ApiClient, log: Logger): Promise<void> {
  for (let attempt = 1; attempt <= RESULT_ATTEMPTS; attempt += 1) {
    try {
      const response = await api.result(jobId, result);
      if (response.status < 500 && response.status !== 429) {
        if (response.status >= 400) log.warn("the result was not accepted", { status: response.status });
        return;
      }
    } catch (error) {
      log.warn("could not send the result", { attempt, error: String(error) });
    }
    if (attempt < RESULT_ATTEMPTS) await pause(500 * attempt);
  }
  log.error("the result could not be delivered", { status: result.status });
}
