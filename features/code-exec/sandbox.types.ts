/**
 * Shared contracts for the sandboxed code-execution feature (the `run_code` tool).
 *
 * The agent's code runs OUT OF PROCESS in an isolated executor — in production, a
 * FRESH AWS Lambda MicroVM per run, terminated right after (see infra/code-exec; a
 * stub in tests) — with no DB connection and no secrets.
 * It reaches CRM data only through the read-only data broker, authenticated by a
 * short-lived, tenant-bound run token. These types are the seam between the app,
 * the executor, and the chat UI — and stay identical regardless of substrate.
 */

export type SandboxLanguage = "python" | "javascript" | "bash";

/**
 * Egress mode for a run. Data and open internet are mutually exclusive by default:
 * - DATA: the read-only CRM broker is reachable; no internet (today's default).
 * - NET: allowlisted internet (via the egress proxy); the broker is fused off —
 *   no run token is minted, so the data wall holds by construction.
 * (A combined DATA+NET mode is deliberately deferred — it re-enables the
 * exfiltration trifecta and needs separate, louder approval.)
 */
export type SandboxMode = "DATA" | "NET";

/** What the agent calls (the `run_code` tool input). */
export type RunCodeRequest = {
  language: SandboxLanguage;
  code: string;
  /** Egress mode; defaults to DATA (broker on, no internet). */
  mode?: SandboxMode;
  /** Optional caller hint; clamped server-side to the configured maximum. */
  timeoutMs?: number;
};

/**
 * A file the USER uploaded, pushed INTO the run's workspace before the code runs.
 * The runner decodes the bytes and writes `<workspace>/<name>` so user code can
 * open it by name. Mirror of SandboxFile's transport, but inbound.
 */
export type SandboxInputFile = {
  /** Basename written into the workspace (sanitized; no path separators). */
  name: string;
  /** File bytes, base64. Resolved server-side from the upload store, never the model. */
  dataBase64: string;
};

/** A file/artifact the code produced (e.g. a chart), stored out-of-band as a URL. */
export type SandboxFile = {
  name: string;
  mime: string;
  sizeBytes: number;
  /** Tenant-guarded URL the chat fetches. Empty until the service stores the bytes. */
  url: string;
  /**
   * Base64 bytes as returned by the executor. The service moves these into the
   * artifact store and replaces them with `url`; they never reach the model/UI.
   */
  dataBase64?: string;
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
  /** Egress mode — selects the VM's network placement (DATA = no internet, NET = proxy). */
  mode: SandboxMode;
  timeoutMs: number;
  memoryMb: number;
  maxOutputBytes: number;
  /** Public URL the sandbox calls back for read-only CRM data. Empty in NET mode. */
  brokerUrl: string;
  /** Short-lived, tenant-bound token the sandbox presents to the broker. Empty in NET mode. */
  runToken: string;
  /**
   * User-uploaded files to seed into the workspace before the code runs (decoded +
   * written as `<workspace>/<name>`). Independent of egress mode — they are pushed
   * in, not fetched, so they need no run token and work in both DATA and NET runs.
   */
  inputFiles?: SandboxInputFile[];
};
