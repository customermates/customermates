import type { AgentToolOutcome } from "./agent-run-limits";

import { unwrapToolOutput } from "./agent-durable-stream";

export const BENCHMARK_TOOL_OUTPUT_MAX_CHARS = 8_000;
export const BENCHMARK_STRUCTURED_CONTENT_MAX_CHARS = 2_000;

export type BenchmarkToolOutputPart = {
  type: "benchmark-tool-output";
  toolCallId: string;
  toolName: string;
  threw: boolean;
  ok: boolean | null;
  text: string;
  textChars: number;
  truncated: boolean;
  structuredContent?: unknown;
};

const DEPLOYMENT_VARIABLES = ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_DEPLOYMENT_ID"];

export function recordsBenchmarkToolOutputs(environment: Record<string, string | undefined>): boolean {
  if (environment.LOCAL_AGENT_BENCHMARK !== "true") return false;
  return DEPLOYMENT_VARIABLES.every((name) => environment[name] === undefined);
}

function serialized(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function outputText(value: unknown): { text: string; ok: boolean | null } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as { ok?: unknown; result?: unknown };
    const ok = typeof record.ok === "boolean" ? record.ok : null;
    if (typeof record.result === "string") return { text: record.result, ok };
    return { text: serialized(value), ok };
  }
  return { text: serialized(value), ok: null };
}

function smallStructuredContent(value: unknown): { structuredContent?: unknown } {
  if (!value || typeof value !== "object" || !("structuredContent" in value)) return {};
  const structuredContent = (value as { structuredContent?: unknown }).structuredContent;
  if (structuredContent === undefined) return {};
  return serialized(structuredContent).length <= BENCHMARK_STRUCTURED_CONTENT_MAX_CHARS ? { structuredContent } : {};
}

export function benchmarkToolOutputPart(outcome: AgentToolOutcome): BenchmarkToolOutputPart {
  if ("threw" in outcome) {
    return {
      type: "benchmark-tool-output",
      toolCallId: outcome.toolCallId,
      toolName: outcome.toolName,
      threw: true,
      ok: null,
      text: "",
      textChars: 0,
      truncated: false,
    };
  }
  const value = unwrapToolOutput(outcome.output);
  const { text, ok } = outputText(value);
  return {
    type: "benchmark-tool-output",
    toolCallId: outcome.toolCallId,
    toolName: outcome.toolName,
    threw: false,
    ok,
    text: text.slice(0, BENCHMARK_TOOL_OUTPUT_MAX_CHARS),
    textChars: text.length,
    truncated: text.length > BENCHMARK_TOOL_OUTPUT_MAX_CHARS,
    ...smallStructuredContent(value),
  };
}
