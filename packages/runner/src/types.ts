export const CLIENT_NAMES = ["claude", "codex", "gemini"] as const;
export type ClientName = (typeof CLIENT_NAMES)[number];

export type FoundClient = { name: ClientName; version: string; binary: string };

export type RunnerJob = { id: string; prompt: string; promptUntrusted: boolean; timeoutAt: string };

export type McpAccess = { url: string; token: string };

export type ClaimedJob = { job: RunnerJob; mcp: McpAccess };

export type JobStatus = "succeeded" | "failed" | "timedOut";

export type JobResult = {
  status: JobStatus;
  summary?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

export type LogFields = Record<string, unknown>;

export type Logger = {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export type TranscriptEvent = Record<string, unknown>;

export type Outcome = {
  summary?: string;
  isError: boolean;
  errorText?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};
