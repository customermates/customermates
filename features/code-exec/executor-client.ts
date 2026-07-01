import crypto from "node:crypto";

import {
  LambdaMicrovmsClient,
  RunMicrovmCommand,
  CreateMicrovmAuthTokenCommand,
  TerminateMicrovmCommand,
} from "@aws-sdk/client-lambda-microvms";

import type { ExecutorRunInput, RunCodeReport } from "./sandbox.types";

import { env } from "@/env";

/**
 * The seam between the app and whatever actually runs the code. Production uses
 * `MicrovmExecutorClient` (AWS Lambda MicroVMs, one fresh VM per run — see
 * infra/code-exec); local/dev can point `LocalExecutorHttpClient` at a plain HTTP
 * process (see sandbox/README.md); tests use the stub. Everything upstream of this
 * interface (the tool, interactor, broker, gating, rendering) is substrate-agnostic.
 */
export interface ExecutorClient {
  run(input: ExecutorRunInput): Promise<RunCodeReport>;
}

const RUN_PORT = 8080;

/** ARN of the AWS-managed connector that opens a MicroVM's public HTTPS endpoint to
 * inbound traffic. Mirrors infra/code-exec/code-exec-stack.ts's `allIngressConnectorArn`
 * (duplicated, not imported — this file must not depend on the CDK app). */
function allIngressConnectorArn(region: string): string {
  return `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`;
}

/**
 * Calls the real production substrate: AWS Lambda MicroVMs. Every run gets a FRESH
 * MicroVM (`RunMicrovmCommand`) from the pre-built image, on the egress connector for
 * its mode (DATA -> broker-only allowlist proxy, NET -> package-registry allowlist
 * proxy — see infra/code-exec), and the MicroVM is terminated right after
 * (`TerminateMicrovmCommand`, in a `finally`) whether the run succeeded or not. No
 * pooling/reuse across runs — a shared, resumed MicroVM would need its own careful
 * per-tenant state-reset story; "fresh VM per run, terminate after" gets tenant
 * isolation for free, at the cost of ~1-2s of VM-start latency per run (snapshot
 * startup is fast, but not free).
 *
 * Auth to the running MicroVM's public HTTPS endpoint is a per-run, short-lived JWE
 * token (`CreateMicrovmAuthTokenCommand`), sent as `X-aws-proxy-auth`. AWS validates
 * it and strips it before the request reaches the container — the container (and any
 * user code running inside it) has zero visibility into this token. This replaces
 * the old shared-secret `x-executor-key` scheme entirely; there is no app-level
 * equivalent to configure or rotate.
 */
export class MicrovmExecutorClient implements ExecutorClient {
  private readonly client: LambdaMicrovmsClient;

  constructor(
    private readonly region: string,
    private readonly imageArn: string,
    private readonly dataConnectorArn: string,
    private readonly netConnectorArn: string,
  ) {
    this.client = new LambdaMicrovmsClient({ region });
  }

  async run(input: ExecutorRunInput): Promise<RunCodeReport> {
    const egressConnector = input.mode === "NET" ? this.netConnectorArn : this.dataConnectorArn;
    // Ceiling on the MicroVM's own lifetime — comfortably above the in-sandbox
    // wall-clock (start latency + the run itself + a margin for termination).
    const maximumDurationInSeconds = Math.ceil(input.timeoutMs / 1000) + 60;

    const runResp = await this.client.send(
      new RunMicrovmCommand({
        imageIdentifier: this.imageArn,
        ingressNetworkConnectors: [allIngressConnectorArn(this.region)],
        egressNetworkConnectors: [egressConnector],
        maximumDurationInSeconds,
        // No suspend/resume — the MicroVM lives exactly as long as this one run.
        idlePolicy: { autoResumeEnabled: false, maxIdleDurationSeconds: 28_800, suspendedDurationSeconds: 1 },
        clientToken: crypto.randomUUID(),
      }),
    );
    const microvmId = runResp.microvmId;
    const endpoint = runResp.endpoint;
    if (!microvmId || !endpoint) throw new Error("run-microvm did not return a microvmId/endpoint");

    try {
      const tokenResp = await this.client.send(
        new CreateMicrovmAuthTokenCommand({
          microvmIdentifier: microvmId,
          // Just long enough to cover the run; never reused past this call.
          expirationInMinutes: Math.max(1, Math.ceil(maximumDurationInSeconds / 60)),
          allowedPorts: [{ port: RUN_PORT }],
        }),
      );
      const authToken = tokenResp.authToken?.["X-aws-proxy-auth"];
      if (!authToken) throw new Error("create-microvm-auth-token did not return an X-aws-proxy-auth token");

      return await this.postRun(endpoint, authToken, input);
    } finally {
      // Best-effort: an orphaned MicroVM self-terminates at maximumDurationInSeconds
      // regardless, so a failed cleanup call here isn't a leak, just a delayed one.
      await this.client.send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId })).catch(() => {});
    }
  }

  /**
   * POSTs the run to the freshly-started MicroVM's endpoint. `GetMicrovm`'s `state`
   * field is documented as eventually-consistent ("determine readiness by connecting
   * to the endpoint" — see microvms-launching guide), so readiness is determined by
   * retrying the actual request rather than polling state separately.
   */
  private async postRun(endpoint: string, authToken: string, input: ExecutorRunInput): Promise<RunCodeReport> {
    const url = `https://${endpoint}/run`;
    const deadline = Date.now() + Math.min(input.timeoutMs + 15_000, 45_000);
    let lastError: unknown;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-aws-proxy-auth": authToken,
            "X-aws-proxy-port": String(RUN_PORT),
          },
          body: JSON.stringify(input),
          // App-side ceiling sits just above the in-sandbox wall-clock so a hung
          // executor can't pin the request thread.
          signal: AbortSignal.timeout(input.timeoutMs + 10_000),
        });

        if (res.status === 502 || res.status === 429) {
          // 502: app not up yet / auto-resume retry budget exhausted (N/A here, but
          // harmless to retry). 429: MicroVM-level rate limit. Both are exactly the
          // "not ready yet" signals the docs describe — brief backoff, try again.
          lastError = new Error(`Sandbox executor responded ${res.status}`);
          await sleep(200);
          continue;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Sandbox executor responded ${res.status}: ${text.slice(0, 200)}`);
        }
        return (await res.json()) as RunCodeReport;
      } catch (error) {
        lastError = error;
        // Only retry when the connection was never established (the VM endpoint isn't
        // accepting connections yet — the "not ready" signal the docs describe). A
        // timeout/abort or a mid-request drop means the run was already dispatched and
        // may be executing, so re-POSTing it could run a non-idempotent program (e.g. an
        // allowWrite run that mutates CRM data) a SECOND time — fail instead.
        if (!isConnectPhaseError(error)) throw error instanceof Error ? error : new Error(String(error));
        await sleep(200);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Sandbox executor did not become ready in time");
  }
}

// Node/undici error codes that mean the request never reached a handler (connection
// refused/reset at connect, DNS not resolving yet, connect-phase timeout) — safe to
// retry because nothing was executed. Notably EXCLUDES AbortSignal.timeout (post-dispatch).
const CONNECT_PHASE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);

function isConnectPhaseError(error: unknown): boolean {
  // AbortSignal.timeout rejects with a Timeout/Abort error — the request was already in
  // flight, so the run may have started; these must never be retried.
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return false;
  const code = (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
  return typeof code === "string" && CONNECT_PHASE_CODES.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Local/dev executor: calls a plain HTTP process directly (no AWS involved — see
 * sandbox/README.md for running one locally). A single local/dev executor can serve
 * both modes (it reads `mode` from the body); `netEndpoint` falls back to `endpoint`
 * when unset. NOT used in production.
 */
export class LocalExecutorHttpClient implements ExecutorClient {
  constructor(
    private readonly endpoint: string,
    private readonly netEndpoint?: string,
  ) {}

  async run(input: ExecutorRunInput): Promise<RunCodeReport> {
    const target = input.mode === "NET" ? (this.netEndpoint ?? this.endpoint) : this.endpoint;
    const res = await fetch(`${target.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
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

type MicrovmConfig = {
  region: string;
  imageArn: string;
  dataConnectorArn: string;
  netConnectorArn: string;
};

function getMicrovmConfig(): MicrovmConfig | null {
  const {
    SANDBOX_MICROVM_REGION,
    SANDBOX_MICROVM_IMAGE_ARN,
    SANDBOX_MICROVM_DATA_CONNECTOR_ARN,
    SANDBOX_MICROVM_NET_CONNECTOR_ARN,
  } = env;
  if (
    !SANDBOX_MICROVM_REGION ||
    !SANDBOX_MICROVM_IMAGE_ARN ||
    !SANDBOX_MICROVM_DATA_CONNECTOR_ARN ||
    !SANDBOX_MICROVM_NET_CONNECTOR_ARN
  )
    return null;
  return {
    region: SANDBOX_MICROVM_REGION,
    imageArn: SANDBOX_MICROVM_IMAGE_ARN,
    dataConnectorArn: SANDBOX_MICROVM_DATA_CONNECTOR_ARN,
    netConnectorArn: SANDBOX_MICROVM_NET_CONNECTOR_ARN,
  };
}

/** True only when the feature is enabled AND a real executor (MicroVM or local/dev) is wired. */
export function isCodeExecConfigured(): boolean {
  if (!env.SANDBOX_CODE_EXEC_ENABLED) return false;
  return Boolean(getMicrovmConfig()) || Boolean(env.SANDBOX_EXECUTOR_URL);
}

export function getExecutorClient(): ExecutorClient {
  const microvm = getMicrovmConfig();
  if (microvm) {
    return new MicrovmExecutorClient(
      microvm.region,
      microvm.imageArn,
      microvm.dataConnectorArn,
      microvm.netConnectorArn,
    );
  }
  if (env.SANDBOX_EXECUTOR_URL)
    return new LocalExecutorHttpClient(env.SANDBOX_EXECUTOR_URL, env.SANDBOX_EXECUTOR_URL_NET);
  throw new Error(
    "Sandbox executor is not configured (set SANDBOX_MICROVM_REGION/IMAGE_ARN/DATA_CONNECTOR_ARN/NET_CONNECTOR_ARN " +
      "for MicroVMs, or SANDBOX_EXECUTOR_URL for a local/dev executor)",
  );
}
