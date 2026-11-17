import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { Readable } from "node:stream";
import type { ApiClient } from "./api-client.js";
import type { RunnerOptions } from "./options.js";
import type { KillTree } from "./process-tree.js";
import type {
  ClaimedJob,
  FinishReason,
  FoundClient,
  JobResult,
  Logger,
  Outcome,
  RunnerJob,
  StreamLine,
  TranscriptEvent,
} from "./types.js";

import { spawn as nodeSpawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { CLIENT_ADAPTERS } from "./clients/index.js";
import { TOKEN_ENV, TOKEN_FILE_ENV } from "./options.js";
import { killProcessTree, ownsProcessGroup } from "./process-tree.js";
import { redactText, redactValue } from "./redact.js";
import { ERROR_MAX, TEXT_MAX, clip } from "./text.js";
import { promptFor } from "./untrusted.js";
import { commandPlan } from "./windows-command.js";

export type Spawn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export type RunJobDeps = {
  api: ApiClient;
  log: Logger;
  spawn?: Spawn;
  killTree?: KillTree;
  now?: () => Date;
  flushMs?: number;
  killGraceMs?: number;
  drainMs?: number;
  retryMs?: number;
  signal?: AbortSignal;
  forceSignal?: AbortSignal;
};

type Confirmation = { timeoutMs: number } | null;

const FLUSH_BATCH = 20;
const MAX_EVENTS = 5000;
const FINISH_EVENTS = 1;
const EVENT_ATTEMPTS = 2;
const STDERR_TAIL = 20;
const REPORT_ATTEMPTS = 3;
const HIDDEN_ENV_NAMES = [TOKEN_ENV, TOKEN_FILE_ENV];
const FINISH_REASONS: Record<JobResult["status"], FinishReason> = {
  succeeded: "stop",
  failed: "error",
  timedOut: "timeLimit",
};

export const RUNNER_ERRORS = { timedOut: "timedOut", stopped: "runnerStopped" } as const;

function childEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const kept = Object.entries({ ...process.env, ...extra }).filter(([name]) => !HIDDEN_ENV_NAMES.includes(name));
  return { ...Object.fromEntries(kept), NODE_ENV: process.env.NODE_ENV ?? "production" };
}

function streamLine(line: string): StreamLine | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as StreamLine) : null;
  } catch {
    return null;
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jobLogger(log: Logger, job: RunnerJob): Logger {
  return {
    info: (message, fields) => log.info(message, { job: job.id, ...fields }),
    warn: (message, fields) => log.warn(message, { job: job.id, ...fields }),
    error: (message, fields) => log.error(message, { job: job.id, ...fields }),
  };
}

async function confirm(job: RunnerJob, api: ApiClient, log: Logger, retryMs: number): Promise<Confirmation> {
  for (let attempt = 1; attempt <= REPORT_ATTEMPTS; attempt += 1) {
    try {
      const response = await api.start(job.id, job.attempt);
      const seconds = response.body?.timeoutInSeconds;
      if (response.status === 200 && typeof seconds === "number" && Number.isFinite(seconds))
        return { timeoutMs: seconds * 1000 };
      if (response.status < 500 && response.status !== 429) {
        log.warn("the server did not confirm the job, leaving it", { status: response.status });
        return null;
      }
    } catch (error) {
      log.warn("could not confirm the job", { attempt, error: String(error) });
    }
    if (attempt < REPORT_ATTEMPTS) await pause(retryMs * attempt);
  }
  log.error("the job could not be confirmed, it returns to the queue");
  return null;
}

async function report(job: RunnerJob, result: JobResult, api: ApiClient, log: Logger, retryMs: number): Promise<void> {
  for (let attempt = 1; attempt <= REPORT_ATTEMPTS; attempt += 1) {
    try {
      const response = await api.result(job.id, job.attempt, result);
      if (response.status < 500 && response.status !== 429) {
        if (response.status >= 400) log.warn("the result was not accepted", { status: response.status });
        return;
      }
    } catch (error) {
      log.warn("could not send the result", { attempt, error: String(error) });
    }
    if (attempt < REPORT_ATTEMPTS) await pause(retryMs * attempt);
  }
  log.error("the result could not be delivered", { status: result.status });
}

export async function runJob(
  claimed: ClaimedJob,
  client: FoundClient,
  options: RunnerOptions,
  deps: RunJobDeps,
): Promise<JobResult | null> {
  const { job, mcp } = claimed;
  const spawn = deps.spawn ?? (nodeSpawn as Spawn);
  const killTree = deps.killTree ?? killProcessTree;
  const now = deps.now ?? (() => new Date());
  const flushMs = deps.flushMs ?? 1000;
  const killGraceMs = deps.killGraceMs ?? 5000;
  const drainMs = deps.drainMs ?? 2000;
  const retryMs = deps.retryMs ?? 500;
  const secrets = [options.token, mcp.token];
  const adapter = CLIENT_ADAPTERS[client.name];
  const observer = adapter.createObserver();
  const log = jobLogger(deps.log, job);

  if (deps.signal?.aborted) {
    log.warn("the runner is stopping, the job stays in the queue");
    return null;
  }
  const confirmed = await confirm(job, deps.api, log, retryMs);
  if (!confirmed) return null;
  if (confirmed.timeoutMs <= 0) {
    const result: JobResult = { status: "timedOut", error: RUNNER_ERRORS.timedOut };
    await report(job, result, deps.api, log, retryMs);
    return result;
  }

  let closed = false;
  let timedOut = false;
  let stopped = false;
  let ended = false;
  let stderrLines: string[] = [];
  let eventCount = 0;
  let pending: TranscriptEvent[] = [];
  let sending: Promise<void> = Promise.resolve();
  let flushTimer: NodeJS.Timeout | null = null;
  let child: ChildProcess | null = null;
  let killTimer: NodeJS.Timeout | null = null;
  let abandonTimer: NodeJS.Timeout | null = null;
  let abandon: () => void = () => undefined;
  const abandoned = new Promise<void>((resolve) => {
    abandon = resolve;
  });
  const directories: string[] = [];

  const kill = (signal: NodeJS.Signals) => {
    if (!child) return;
    try {
      killTree(child, signal);
    } catch (error) {
      log.warn("could not stop the client", { error: String(error) });
    }
  };

  const terminate = (reason: "timeout" | "closed" | "shutdown") => {
    if (reason === "timeout") timedOut = true;
    else stopped = true;
    if (!child || ended || killTimer) return;
    kill("SIGTERM");
    killTimer = setTimeout(() => {
      kill("SIGKILL");
      abandonTimer ??= setTimeout(abandon, drainMs);
    }, killGraceMs);
  };

  const forceStop = () => {
    stopped = true;
    if (!child || ended) return;
    kill("SIGKILL");
    abandonTimer ??= setTimeout(abandon, drainMs);
  };

  const sendBatch = async (batch: TranscriptEvent[]) => {
    for (let attempt = 1; attempt <= EVENT_ATTEMPTS; attempt += 1) {
      try {
        const response = await deps.api.events(job.id, job.attempt, batch);
        if (response.status === 404 || response.status === 409) {
          closed = true;
          log.warn("server closed the job, stopping the client", { status: response.status });
          return terminate("closed");
        }
        if (response.status === 401) return terminate("shutdown");
        if (response.status < 400) return;
        log.warn("events were not accepted", { status: response.status, attempt });
        if (response.status < 500 && response.status !== 429) return;
      } catch (error) {
        log.warn("could not send events", { attempt, error: redactText(String(error), secrets) });
      }
      if (attempt < EVENT_ATTEMPTS) await pause(retryMs);
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

  const push = (events: readonly TranscriptEvent[], limit = MAX_EVENTS - FINISH_EVENTS) => {
    for (const event of events) {
      if (eventCount >= limit) break;
      eventCount += 1;
      pending.push(redactValue(event, secrets) as TranscriptEvent);
    }
    if (pending.length >= FLUSH_BATCH) void flush();
    else if (pending.length > 0) flushTimer ??= setTimeout(() => void flush(), flushMs);
  };

  const abortListener = () => terminate("shutdown");
  const forceListener = () => forceStop();
  deps.signal?.addEventListener("abort", abortListener, { once: true });
  deps.forceSignal?.addEventListener("abort", forceListener, { once: true });
  if (deps.signal?.aborted) terminate("shutdown");
  const timeoutTimer = setTimeout(() => terminate("timeout"), confirmed.timeoutMs);

  let exitCode: number | null = null;
  let startFailure: string | null = null;
  const runClient = async () => {
    const temporary = async (prefix: string) => {
      const directory = await mkdtemp(join(tmpdir(), prefix));
      directories.push(directory);
      return directory;
    };
    const configDir = await temporary("customermates-runner-");
    const workDir = options.workdir ?? (await temporary("customermates-work-"));
    const invocation = adapter.prepare({
      prompt: promptFor(job.prompt, job.promptUntrusted),
      mcp,
      options,
      configDir,
      workDir,
    });
    for (const file of invocation.files) await writeFile(join(configDir, file.name), file.content, { mode: 0o600 });
    if (timedOut) return;
    if (deps.signal?.aborted || deps.forceSignal?.aborted) {
      stopped = true;
      return;
    }

    log.info("starting client", { client: client.name, version: client.version });
    const plan = commandPlan(client.binary, invocation.args, process.env);
    child = spawn(plan.command, plan.args, {
      cwd: workDir,
      env: childEnvironment({ ...invocation.env }),
      stdio: ["pipe", "pipe", "pipe"],
      detached: ownsProcessGroup(),
      windowsHide: true,
      windowsVerbatimArguments: plan.verbatim,
    });
    const running = child;

    const exited = new Promise<void>((resolve) => {
      running.once("error", (error) => {
        stderrLines.push(String(error.message));
        ended = true;
        resolve();
      });
      running.once("exit", (code) => {
        exitCode = code;
        ended = true;
        abandonTimer ??= setTimeout(abandon, drainMs);
      });
      running.once("close", (code) => {
        exitCode = code ?? exitCode;
        ended = true;
        resolve();
      });
    });

    const readers: Array<{ close(): void }> = [];
    const streamDone = (stream: Readable | null, onLine: (line: string) => void) =>
      new Promise<void>((resolve) => {
        if (!stream) return resolve();
        const lines = createInterface({ input: stream });
        readers.push(lines);
        lines.on("line", (line) => {
          if (line.trim()) onLine(line);
        });
        lines.once("close", () => resolve());
      });
    const stdoutDone = streamDone(running.stdout, (line) => {
      const parsed = streamLine(line);
      if (parsed) push(observer.observe(parsed, now().toISOString()));
    });
    const stderrDone = streamDone(running.stderr, (line) => {
      stderrLines = [...stderrLines, line].slice(-STDERR_TAIL);
    });
    running.stdin?.on("error", () => undefined);
    running.stdin?.end(invocation.stdin);
    if (deps.forceSignal?.aborted) forceStop();
    else if (timedOut) terminate("timeout");
    else if (stopped || deps.signal?.aborted) terminate("shutdown");

    const drained = await Promise.race([
      Promise.all([exited, stdoutDone, stderrDone]).then(() => true),
      abandoned.then(() => false),
    ]);
    if (!drained) {
      log.warn("the client left processes or open output behind, stopping them");
      kill("SIGKILL");
      for (const reader of readers) reader.close();
      running.stdout?.destroy();
      running.stderr?.destroy();
    }
  };
  try {
    if (!deps.signal?.aborted) await runClient();
  } catch (error) {
    startFailure = redactText(error instanceof Error ? error.message : String(error), secrets);
  } finally {
    clearTimeout(timeoutTimer);
    if (killTimer) clearTimeout(killTimer);
    if (abandonTimer) clearTimeout(abandonTimer);
    deps.signal?.removeEventListener("abort", abortListener);
    deps.forceSignal?.removeEventListener("abort", forceListener);
  }

  const result = resultOf(observer.outcome(), { exitCode, timedOut, stopped, stderrLines, secrets, startFailure });
  if (!closed) {
    push(observer.flush(now().toISOString()));
    push(
      [
        {
          type: "finish",
          at: now().toISOString(),
          reason: stopped && !timedOut ? "cancelled" : FINISH_REASONS[result.status],
          ...(result.summary === undefined ? {} : { text: result.summary }),
        },
      ],
      MAX_EVENTS,
    );
  }
  await flush();
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true }).catch((error: unknown) => {
      log.warn("could not remove a temporary directory", { error: String(error) });
    });
  }

  log.info("client finished", { status: result.status, exitCode });
  if (!closed) await report(job, result, deps.api, log, retryMs);
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
  };
  const summary =
    outcome.summary === undefined ? {} : { summary: clip(redactText(outcome.summary, context.secrets), TEXT_MAX) };
  if (context.timedOut) return { status: "timedOut", error: RUNNER_ERRORS.timedOut, ...summary, ...tokens };
  if (context.stopped) return { status: "failed", error: RUNNER_ERRORS.stopped, ...summary, ...tokens };
  const failed = context.startFailure !== null || outcome.isError || context.exitCode !== 0;
  if (!failed) return { status: "succeeded", ...summary, ...tokens };
  const reason =
    context.startFailure ??
    outcome.errorText ??
    context.stderrLines.at(-1) ??
    (context.exitCode === null ? "the client could not be started" : `the client exited with code ${context.exitCode}`);
  return {
    status: "failed",
    error: clip(redactText(reason, context.secrets), ERROR_MAX),
    ...summary,
    ...tokens,
  };
}
