import type { ApiClient } from "./api-client.js";
import type { RunnerOptions } from "./options.js";
import type { ClaimedJob, FoundClient, JobResult, Logger } from "./types.js";

import { chooseClient, usableClients } from "./discover.js";

export type DaemonDeps = {
  api: ApiClient;
  log: Logger;
  discover: () => Promise<FoundClient[]>;
  runJob: (claimed: ClaimedJob, client: FoundClient, signal: AbortSignal) => Promise<JobResult | null>;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  hostname: string;
  now?: () => number;
};

export type DaemonExit = "stopped" | "unauthorized";

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const NO_CLIENT_WAIT_MS = 5000;
const CLOCK_SKEW_WARN_MS = 60_000;

export function backoffDelay(failures: number, retryAfterMs: number | null): number {
  const exponential = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.max(0, failures - 1));
  return Math.max(exponential, retryAfterMs ?? 0);
}

export async function runDaemon(options: RunnerOptions, deps: DaemonDeps, signal: AbortSignal): Promise<DaemonExit> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const now = deps.now ?? (() => Date.now());
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) controller.abort();
  let exit: DaemonExit = "stopped";
  let clients: FoundClient[] = [];
  let skewWarned = false;

  const unauthorized = () => {
    exit = "unauthorized";
    deps.log.error("the server rejected the runner token: it was revoked or is wrong, stopping");
    controller.abort();
  };

  const noteClock = (serverTime: string | undefined) => {
    const skewMs = serverTime ? now() - Date.parse(serverTime) : 0;
    if (skewWarned || !Number.isFinite(skewMs) || Math.abs(skewMs) < CLOCK_SKEW_WARN_MS) return;
    skewWarned = true;
    deps.log.warn("this machine's clock differs from the server's; job time limits follow the server", {
      skewSeconds: Math.round(skewMs / 1000),
    });
  };

  const heartbeat = async (): Promise<boolean> => {
    clients = usableClients(await deps.discover(), options.client);
    try {
      const response = await deps.api.heartbeat(deps.hostname, clients, controller.signal);
      if (response.status === 401) {
        unauthorized();
        return false;
      }
      if (response.status >= 400) deps.log.warn("heartbeat was not accepted", { status: response.status });
      else noteClock(response.body?.serverTime);
      return true;
    } catch (error) {
      if (!controller.signal.aborted) deps.log.warn("heartbeat failed", { error: String(error) });
      return true;
    }
  };

  const heartbeatLoop = async () => {
    for (;;) {
      await deps.sleep(options.heartbeatMs, controller.signal);
      if (controller.signal.aborted || !(await heartbeat())) return;
    }
  };

  const claimLoop = async () => {
    let failures = 0;
    while (!controller.signal.aborted) {
      const client = chooseClient(clients, options.client);
      if (!client) {
        deps.log.warn("no usable client found, waiting before taking jobs", { wanted: options.client ?? "any" });
        await deps.sleep(NO_CLIENT_WAIT_MS, controller.signal);
        continue;
      }
      try {
        const response = await deps.api.claim(controller.signal);
        if (response.status === 401) return unauthorized();
        if (response.status === 200 && response.body) {
          failures = 0;
          try {
            await deps.runJob(response.body, client, controller.signal);
          } catch (error) {
            deps.log.error("the job could not be run", { job: response.body.job.id, error: String(error) });
          }
          continue;
        }
        if (response.status === 204) {
          failures = 0;
          continue;
        }
        failures += 1;
        await deps.sleep(backoffDelay(failures, response.retryAfterMs), controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        deps.log.warn("could not reach the server", { error: String(error), retryInMs: backoffDelay(failures, null) });
        await deps.sleep(backoffDelay(failures, null), controller.signal);
      }
    }
  };

  deps.log.info("runner started", { url: options.url, client: options.client ?? "first found" });
  if (options.tokenOnCommandLine) {
    deps.log.warn("the token was passed with --token and is visible to other users of this machine", {
      use: "CUSTOMERMATES_RUNNER_TOKEN or --token-file",
    });
  }
  if (!(await heartbeat())) return exit;
  deps.log.info("clients found", { clients: clients.map((client) => `${client.name} ${client.version}`) });
  await Promise.all([heartbeatLoop(), claimLoop()]);
  signal.removeEventListener("abort", stop);
  deps.log.info("runner stopped");
  return exit;
}
