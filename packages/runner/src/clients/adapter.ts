import type { ClientName, McpAccess, Outcome, TranscriptEvent } from "../types.js";
import type { RunnerOptions } from "../options.js";

export const MCP_SERVER_NAME = "customermates";
export const JOB_TOKEN_ENV = "CUSTOMERMATES_JOB_TOKEN";

export type ConfigFile = { name: string; content: string };

export type PrepareInput = {
  prompt: string;
  mcp: McpAccess;
  options: RunnerOptions;
  configDir: string;
};

export type Invocation = {
  args: string[];
  env: Record<string, string>;
  stdin?: string;
  files: ConfigFile[];
};

export type Observer = {
  observe(event: TranscriptEvent): void;
  outcome(): Outcome;
};

export type ClientAdapter = {
  name: ClientName;
  prepare(input: PrepareInput): Invocation;
  createObserver(): Observer;
};

export function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
