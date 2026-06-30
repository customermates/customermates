import type { RunCodeReport, SandboxLanguage, SandboxMode } from "./sandbox.types";

import { getUserService } from "@/core/di";
import { env } from "@/env";

import { issueRunToken } from "./run-token";
import { getExecutorClient, isCodeExecConfigured } from "./executor-client";
import { scrubSecrets } from "./scrub";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 30_000;
const MEMORY_MB = 256;
const MAX_OUTPUT_BYTES = 64_000;

function errorReport(message: string): RunCodeReport {
  return { status: "error", stdout: "", files: [], durationMs: 0, exitCode: null, error: { message } };
}

/**
 * Orchestrates one sandboxed run: verifies the feature is enabled, mints a
 * short-lived tenant-bound run token, dispatches to the executor, and scrubs the
 * report before it reaches the model. Read-only — the sandbox can only reach the
 * read broker. Runs in the agent route's authenticated (session) context.
 */
export async function runUserCode(request: {
  language: SandboxLanguage;
  code: string;
  mode?: SandboxMode;
  timeoutMs?: number;
}): Promise<RunCodeReport> {
  if (!isCodeExecConfigured()) return errorReport("Code execution is not enabled on this deployment.");

  const user = await getUserService().getActiveUserOrThrow();
  const mode: SandboxMode = request.mode === "NET" ? "NET" : "DATA";
  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);

  // DATA: mint a broker token + broker URL (CRM data reachable, no internet).
  // NET: mint NO token and pass no broker URL — the data wall holds by
  // construction; the VM is placed on the allowlist-proxy network instead.
  const token =
    mode === "DATA"
      ? issueRunToken({ companyId: user.companyId, userId: user.id, ttlMs: timeoutMs + 15_000 }).token
      : "";
  const brokerUrl =
    mode === "DATA" ? `${(env.SANDBOX_BROKER_URL ?? env.BASE_URL).replace(/\/$/, "")}/api/v1/sandbox/data` : "";

  let report: RunCodeReport;
  try {
    report = await getExecutorClient().run({
      language: request.language,
      code: request.code,
      mode,
      timeoutMs,
      memoryMb: MEMORY_MB,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      brokerUrl,
      runToken: token,
    });
  } catch (error) {
    return errorReport(`Sandbox failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    ...report,
    stdout: scrubSecrets(report.stdout ?? ""),
    error: report.error
      ? {
          message: scrubSecrets(report.error.message),
          traceback: report.error.traceback ? scrubSecrets(report.error.traceback) : undefined,
        }
      : undefined,
  };
}
