import type { ClaimedJob, FoundClient, JobResult, StartedJob, TranscriptEvent } from "./types.js";

export type ApiResult<T> = { status: number; body: T | null; retryAfterMs: number | null };

export type HeartbeatAnswer = { serverTime?: string };

export type ApiClient = {
  heartbeat(
    machine: string,
    clients: readonly FoundClient[],
    signal?: AbortSignal,
  ): Promise<ApiResult<HeartbeatAnswer>>;
  claim(signal?: AbortSignal): Promise<ApiResult<ClaimedJob>>;
  start(jobId: string, attempt: number): Promise<ApiResult<StartedJob>>;
  events(jobId: string, attempt: number, events: readonly TranscriptEvent[]): Promise<ApiResult<unknown>>;
  result(jobId: string, attempt: number, result: JobResult): Promise<ApiResult<unknown>>;
};

type ClientOptions = { baseUrl: string; token: string; fetch?: typeof fetch; version?: string };

const CLAIM_TIMEOUT_MS = 40_000;
const REQUEST_TIMEOUT_MS = 30_000;

function retryAfterOf(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

export function createApiClient(options: ClientOptions): ApiClient {
  const send = options.fetch ?? fetch;

  async function post<T>(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<ApiResult<T>> {
    const response = await send(`${options.baseUrl}/api/v1/runner/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "user-agent": `customermates-runner/${options.version ?? "0"}`,
      },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
    const text = response.status === 204 ? "" : await response.text();
    let parsed: T | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        parsed = null;
      }
    }
    return { status: response.status, body: parsed, retryAfterMs: retryAfterOf(response) };
  }

  const jobPath = (jobId: string, action: string) => `jobs/${encodeURIComponent(jobId)}/${action}`;

  return {
    heartbeat: (machine, clients, signal) =>
      post(
        "heartbeat",
        { machine, clients: clients.map(({ name, version }) => ({ name, version })) },
        REQUEST_TIMEOUT_MS,
        signal,
      ),
    claim: (signal) => post("jobs/claim", {}, CLAIM_TIMEOUT_MS, signal),
    start: (jobId, attempt) => post(jobPath(jobId, "start"), { attempt }, REQUEST_TIMEOUT_MS),
    events: (jobId, attempt, events) => post(jobPath(jobId, "events"), { attempt, events }, REQUEST_TIMEOUT_MS),
    result: (jobId, attempt, result) => post(jobPath(jobId, "result"), { attempt, ...result }, REQUEST_TIMEOUT_MS),
  };
}
