export const CLIENT_NAMES = ["claude", "codex", "gemini"] as const;
export type ClientName = (typeof CLIENT_NAMES)[number];

export type FoundClient = { name: ClientName; version: string; binary: string };

export type RunnerJob = {
  id: string;
  attempt: number;
  prompt: string;
  promptUntrusted: boolean;
  confirmWithinSeconds: number;
};

export type McpAccess = { url: string; token: string };

export type ClaimedJob = { job: RunnerJob; mcp: McpAccess };

export type StartedJob = { timeoutInSeconds: number };

export type JobStatus = "succeeded" | "failed" | "timedOut";

export type JobResult = {
  status: JobStatus;
  summary?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type LogFields = Record<string, unknown>;

export type Logger = {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export type FinishReason = "stop" | "timeLimit" | "error" | "cancelled";

export type TranscriptEvent =
  | { type: "message"; at: string; role: "assistant"; text: string }
  | { type: "toolCall"; at: string; toolCallId: string; name: string; argumentsDigest: string }
  | { type: "toolResult"; at: string; toolCallId: string; name: string; ok: boolean; summary: string }
  | { type: "finish"; at: string; reason: FinishReason; text?: string };

export type StreamLine = Record<string, unknown>;

export type Outcome = {
  summary?: string;
  isError: boolean;
  errorText?: string;
  inputTokens?: number;
  outputTokens?: number;
};
