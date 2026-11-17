import type { ClientName, McpAccess, Outcome, StreamLine, TranscriptEvent } from "../types.js";
import type { RunnerOptions } from "../options.js";

import { DIGEST_MAX, NAME_MAX, TEXT_MAX, clip, digest } from "../text.js";

export const MCP_SERVER_NAME = "customermates";
export const JOB_TOKEN_ENV = "CUSTOMERMATES_JOB_TOKEN";

export type ConfigFile = { name: string; content: string };

export type PrepareInput = {
  prompt: string;
  mcp: McpAccess;
  options: RunnerOptions;
  configDir: string;
  workDir: string;
};

export type Invocation = {
  args: string[];
  env: Record<string, string>;
  stdin: string;
  files: ConfigFile[];
};

export type Observer = {
  observe(line: StreamLine, at: string): TranscriptEvent[];
  flush(at: string): TranscriptEvent[];
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

export function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function idOf(value: unknown): string {
  return clip(typeof value === "string" || typeof value === "number" ? String(value) : "", NAME_MAX);
}

function nameOf(value: unknown): string {
  return clip(textOf(value) ?? "tool", NAME_MAX);
}

export function messageEvent(at: string, text: string): TranscriptEvent {
  return { type: "message", at, role: "assistant", text: clip(text, TEXT_MAX) };
}

export function toolCallEvent(at: string, id: unknown, name: unknown, input: unknown): TranscriptEvent {
  return { type: "toolCall", at, toolCallId: idOf(id), name: nameOf(name), argumentsDigest: digest(input, DIGEST_MAX) };
}

export function toolResultEvent(at: string, id: unknown, name: unknown, ok: boolean, output: unknown): TranscriptEvent {
  return { type: "toolResult", at, toolCallId: idOf(id), name: nameOf(name), ok, summary: digest(output, DIGEST_MAX) };
}
