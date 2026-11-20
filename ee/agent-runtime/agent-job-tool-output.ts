import { isAgentToolCancellation } from "@/ee/agent-chat/agent-tool-cancellation";

export type AgentJobToolOutcome = { ok: boolean; summary: string };

function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function summarizeAgentJobToolOutput(output: unknown): AgentJobToolOutcome {
  if (isAgentToolCancellation(output)) return { ok: false, summary: flat(String(output.message ?? "cancelled")) };
  if (typeof output === "object" && output !== null) {
    const { ok, result } = output as { ok?: unknown; result?: unknown };
    if (typeof ok === "boolean" && typeof result === "string") return { ok, summary: flat(result) };
  }
  if (typeof output === "string") return { ok: true, summary: flat(output) };
  try {
    return { ok: true, summary: flat(JSON.stringify(output) ?? "") };
  } catch {
    return { ok: true, summary: "" };
  }
}
