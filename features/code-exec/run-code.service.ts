import type { RunCodeReport, SandboxInputFile, SandboxLanguage, SandboxMode } from "./sandbox.types";

import { getUserService } from "@/core/di";
import { env } from "@/env";

import { issueRunToken } from "./run-token";
import { getExecutorClient, isCodeExecConfigured } from "./executor-client";
import { scrubSecrets } from "./scrub";
import { putArtifact } from "./artifact-store";
import { getUpload } from "./upload-store";
import { completeRun, createRun, failRun } from "./run-store";

type RunRequest = {
  language: SandboxLanguage;
  code: string;
  mode?: SandboxMode;
  timeoutMs?: number;
  /**
   * Uploaded files to seed into the workspace. Each `uploadId` is resolved against
   * the upload store under THIS user's company (the tenant gate); the model only
   * ever supplies file names, which the route maps to ids it derived from the
   * conversation — it can't reach another company's upload.
   */
  inputFiles?: Array<{ uploadId: string; name: string }>;
  /**
   * Opt-in for mutations. Default (false) = read-only: code may read CRM data and
   * call read-only tools, but mutating tools (create/update/delete/send/…) are
   * refused by the broker. true grants the "write" capability for this run.
   */
  allowWrite?: boolean;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 30_000;
const MEMORY_MB = 256;
const MAX_OUTPUT_BYTES = 64_000;
// Total bytes of uploaded inputs we'll inline into one executor request. Bounds the
// request body (base64 inflates ~33%). NOTE: the production Lambda MicroVM caps a
// sync invoke at ~6 MB — for larger inputs there, switch to broker-fetch-by-id; the
// in-process HTTP runner has no such cap.
const MAX_INPUT_TOTAL_BYTES = 25 * 1024 * 1024;

function errorReport(message: string): RunCodeReport {
  return { status: "error", stdout: "", files: [], durationMs: 0, exitCode: null, error: { message } };
}

/** Reject path separators / traversal / control chars so an upload name can't escape
 * the workspace or break the executor's file write. */
function safeUploadName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  if (!base || base === "." || base === "..") return null;
  // Reject control chars (incl. NUL): not valid filenames, and a NUL makes
  // fs.writeFile throw, which would abort the whole run.
  for (let i = 0; i < base.length; i++) if (base.charCodeAt(i) < 0x20) return null;
  return base;
}

/**
 * Executes one sandboxed run for an ALREADY-RESOLVED user: mints a short-lived
 * tenant-bound run token, dispatches to the executor, and scrubs the report before
 * it reaches the model. The user is passed in (not read from the session) so this
 * works both in-request AND in a fire-and-forget background task whose request
 * context has closed. Read-only — the sandbox can only reach the read broker.
 */
async function executeRun(request: RunRequest, user: { companyId: string; id: string }): Promise<RunCodeReport> {
  const mode: SandboxMode = request.mode === "NET" ? "NET" : "DATA";
  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);

  // Resolve uploaded inputs to base64 the executor seeds into the workspace. Each is
  // tenant-checked via getUpload(id, companyId); unknown/expired ids are skipped.
  const inputFiles: SandboxInputFile[] = [];
  let inputTotal = 0;
  for (const requested of request.inputFiles ?? []) {
    const upload = getUpload(requested.uploadId, user.companyId);
    if (!upload) continue;
    const name = safeUploadName(requested.name || upload.name);
    if (!name) continue;
    inputTotal += upload.bytes.length;
    if (inputTotal > MAX_INPUT_TOTAL_BYTES) {
      return errorReport(
        `Selected input files exceed the ${Math.floor(MAX_INPUT_TOTAL_BYTES / (1024 * 1024))} MB per-run limit. ` +
          "Pass fewer file names in inputFiles.",
      );
    }
    inputFiles.push({ name, dataBase64: upload.bytes.toString("base64") });
  }

  // DATA: mint a broker token + broker URL (CRM data reachable, no internet).
  // NET: mint NO token and pass no broker URL — the data wall holds by
  // construction; the VM is placed on the allowlist-proxy network instead.
  const token =
    mode === "DATA"
      ? issueRunToken({
          companyId: user.companyId,
          userId: user.id,
          ttlMs: timeoutMs + 10_000,
          // DATA runs may read CRM data and call read-only tools by default; the
          // "write" capability (mutating tools) is granted ONLY when the agent opted
          // in via allowWrite. The run_code approval card (showing the exact code +
          // a write warning) is the human gate; the broker enforces RBAC + a per-run
          // call cap + this capability split.
          caps: request.allowWrite ? ["read", "tool", "write"] : ["read", "tool"],
        }).token
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
      inputFiles: inputFiles.length ? inputFiles : undefined,
    });
  } catch (error) {
    return errorReport(`Sandbox failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Move any returned file bytes into the transient store; the model/UI see only a
  // tenant-guarded URL (relative to the app origin), never the bytes.
  const files = (report.files ?? []).map((f) => {
    if (!f.dataBase64) return { name: f.name, mime: f.mime, sizeBytes: f.sizeBytes, url: f.url };
    const bytes = Buffer.from(f.dataBase64, "base64");
    const id = putArtifact({ bytes, mime: f.mime, name: f.name, companyId: user.companyId, userId: user.id });
    return { name: f.name, mime: f.mime, sizeBytes: bytes.length, url: `/api/v1/sandbox/artifacts/${id}` };
  });

  // Scrub generic secret shapes AND the run token specifically: its 2-segment
  // base64url form isn't matched by scrubSecrets, so code that printed
  // process.env.SANDBOX_RUN_TOKEN would otherwise echo a live token to the model/chat.
  const redact = (s: string): string => {
    const scrubbed = scrubSecrets(s ?? "");
    return token ? scrubbed.split(token).join("[redacted]") : scrubbed;
  };

  return {
    ...report,
    files,
    stdout: redact(report.stdout ?? ""),
    error: report.error
      ? {
          message: redact(report.error.message),
          traceback: report.error.traceback ? redact(report.error.traceback) : undefined,
        }
      : undefined,
  };
}

/**
 * Run sandboxed code synchronously and return the full report. Resolves the user
 * from the request/session context. Used by the foreground run_code path.
 */
export async function runUserCode(request: RunRequest): Promise<RunCodeReport> {
  if (!isCodeExecConfigured()) return errorReport("Code execution is not enabled on this deployment.");
  const user = await getUserService().getActiveUserOrThrow();
  return executeRun(request, user);
}

/**
 * Start a run in the BACKGROUND: register it, kick off execution fire-and-forget, and
 * return a runId immediately so the agent stays responsive. The result is retrieved
 * later via the run store (check_run). The user is captured NOW because the request's
 * session context is gone by the time the background task runs (see run-store caveat).
 * Returns an errorReport instead of a runId only when the feature is disabled.
 */
export async function startBackgroundRun(request: RunRequest): Promise<{ runId: string } | RunCodeReport> {
  if (!isCodeExecConfigured()) return errorReport("Code execution is not enabled on this deployment.");
  const user = await getUserService().getActiveUserOrThrow();
  const runId = createRun({ companyId: user.companyId, userId: user.id });
  void executeRun(request, user)
    .then((report) => completeRun(runId, report))
    .catch((error) => failRun(runId, error instanceof Error ? error.message : String(error)));
  return { runId };
}
