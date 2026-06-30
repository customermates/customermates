import type { RunCodeReport, SandboxLanguage } from "./sandbox.types";

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
  timeoutMs?: number;
}): Promise<RunCodeReport> {
  if (!isCodeExecConfigured()) return errorReport("Code execution is not enabled on this deployment.");

  const user = await getUserService().getActiveUserOrThrow();
  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);
  const { token } = issueRunToken({ companyId: user.companyId, userId: user.id, ttlMs: timeoutMs + 15_000 });
  const brokerUrl = `${(env.SANDBOX_BROKER_URL ?? env.BASE_URL).replace(/\/$/, "")}/api/v1/sandbox/data`;

  let report: RunCodeReport;
  try {
    report = await getExecutorClient().run({
      language: request.language,
      code: request.code,
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
