import type { ExecutorRunInput, RunCodeReport } from "./sandbox.types";

import { env } from "@/env";

/**
 * The seam between the app and whatever actually runs the code. Production uses
 * the MicroVM client (HTTP to an isolated AWS Lambda MicroVM); tests use the
 * stub. Everything upstream of this interface (the tool, interactor, broker,
 * gating, rendering) is substrate-agnostic.
 */
export interface ExecutorClient {
  run(input: ExecutorRunInput): Promise<RunCodeReport>;
}

/** Calls the isolated executor service (AWS Lambda MicroVM) over HTTPS. */
export class MicroVmExecutorClient implements ExecutorClient {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
  ) {}

  async run(input: ExecutorRunInput): Promise<RunCodeReport> {
    const res = await fetch(`${this.endpoint.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-executor-key": this.apiKey },
      body: JSON.stringify(input),
      // App-side ceiling sits just above the in-sandbox wall-clock so a hung VM
      // can't pin the request thread.
      signal: AbortSignal.timeout(input.timeoutMs + 10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sandbox executor responded ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as RunCodeReport;
  }
}

/** Deterministic test/local executor — runs nothing unless given an impl. */
export class StubExecutorClient implements ExecutorClient {
  constructor(private readonly impl?: (input: ExecutorRunInput) => RunCodeReport | Promise<RunCodeReport>) {}

  run(input: ExecutorRunInput): Promise<RunCodeReport> {
    if (this.impl) return Promise.resolve(this.impl(input));
    return Promise.resolve({ status: "ok", stdout: "", result: null, files: [], durationMs: 0, exitCode: 0 });
  }
}

/** True only when the feature is enabled AND a real executor endpoint is wired. */
export function isCodeExecConfigured(): boolean {
  return Boolean(env.SANDBOX_CODE_EXEC_ENABLED && env.SANDBOX_EXECUTOR_URL && env.SANDBOX_EXECUTOR_API_KEY);
}

export function getExecutorClient(): ExecutorClient {
  if (!env.SANDBOX_EXECUTOR_URL || !env.SANDBOX_EXECUTOR_API_KEY)
    throw new Error("Sandbox executor is not configured (SANDBOX_EXECUTOR_URL / SANDBOX_EXECUTOR_API_KEY)");

  return new MicroVmExecutorClient(env.SANDBOX_EXECUTOR_URL, env.SANDBOX_EXECUTOR_API_KEY);
}
