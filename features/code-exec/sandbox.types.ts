/**
 * Shared contracts for the sandboxed code-execution feature (the `run_code` tool).
 *
 * The agent's code runs OUT OF PROCESS in an isolated executor (an AWS Lambda
 * MicroVM in production; a stub in tests) with no DB connection and no secrets.
 * It reaches CRM data only through the read-only data broker, authenticated by a
 * short-lived, tenant-bound run token. These types are the seam between the app,
 * the executor, and the chat UI — and stay identical regardless of substrate.
 */

export type SandboxLanguage = "python" | "javascript";

/** What the agent calls (the `run_code` tool input). */
export type RunCodeRequest = {
  language: SandboxLanguage;
  code: string;
  /** Optional caller hint; clamped server-side to the configured maximum. */
  timeoutMs?: number;
};

/** A file/artifact the code produced (e.g. a chart), stored out-of-band as a URL. */
export type SandboxFile = {
  name: string;
  mime: string;
  sizeBytes: number;
  url: string;
};

/** The structured result of one run, surfaced to the model + rendered in chat. */
export type RunCodeReport = {
  status: "ok" | "error" | "timeout";
  /** Captured stdout, already truncated to the output cap. */
  stdout: string;
  /** The script's explicit result / last expression value, if any. */
  result?: unknown;
  error?: { message: string; traceback?: string };
  files: SandboxFile[];
  durationMs: number;
  exitCode: number | null;
  /** True when stdout (or result) was clipped by the output cap. */
  truncated?: boolean;
};

/** What the executor backend receives. Carries the run token, never raw secrets. */
export type ExecutorRunInput = {
  language: SandboxLanguage;
  code: string;
  timeoutMs: number;
  memoryMb: number;
  maxOutputBytes: number;
  /** Public URL the sandbox calls back for read-only CRM data. */
  brokerUrl: string;
  /** Short-lived, tenant-bound token the sandbox presents to the broker. */
  runToken: string;
};
