import type { AgentActivityStatus } from "./agent-turn-transcript";

import { describeAgentTool } from "./agent-activity";
import { internalToolIdentity } from "./tool-identity";
import { isAgentToolCancellation } from "./agent-tool-cancellation";

export const AGENT_FORWARDED_WORKFLOW_EVENTS = [
  "activity_superseded",
  "approval_request",
  "approval_resolved",
  "ui_command",
  "message_committed",
  "turn_done",
] as const;

export type AgentClientEvent = { type: string; payload: Record<string, unknown> };

export function agentToolOutcomeStatus(output: unknown): { status: AgentActivityStatus; failed: boolean } {
  if (isAgentToolCancellation(output)) return { status: "cancelled", failed: false };
  const failed = Boolean(output && typeof output === "object" && (output as { ok?: unknown }).ok === false);
  return { status: failed ? "error" : "done", failed };
}

function unwrapToolOutput(output: unknown) {
  return output && typeof output === "object" && "value" in output ? (output as { value: unknown }).value : output;
}

export class AgentDurableStreamReader {
  private readonly toolInputs = new Map<string, unknown>();

  read(chunk: unknown): AgentClientEvent | null {
    if (!chunk || typeof chunk !== "object") return null;
    const part = chunk as {
      type?: string;
      text?: string;
      toolCallId?: string;
      toolName?: string;
      input?: unknown;
      output?: unknown;
      payload?: Record<string, unknown>;
    };

    if (part.type && (AGENT_FORWARDED_WORKFLOW_EVENTS as readonly string[]).includes(part.type))
      return { type: part.type, payload: part.payload ?? {} };

    if (part.type === "text-delta" && part.text) return { type: "delta", payload: { text: part.text } };

    if (part.type === "tool-call" && part.toolCallId && part.toolName) {
      this.toolInputs.set(part.toolCallId, part.input);
      return {
        type: "activity",
        payload: {
          id: part.toolCallId,
          activity: describeAgentTool(internalToolIdentity(part.toolName), part.input),
        },
      };
    }

    if (part.type === "tool-result" && part.toolCallId) {
      const { status, failed } = agentToolOutcomeStatus(unwrapToolOutput(part.output));
      return { type: "activity_result", payload: { id: part.toolCallId, isError: failed, status } };
    }

    if (part.type === "tool-error" && part.toolCallId)
      return { type: "activity_result", payload: { id: part.toolCallId, isError: true, status: "error" } };

    if (part.type === "tool-output-denied" && part.toolCallId)
      return { type: "activity_result", payload: { id: part.toolCallId, isError: false, status: "cancelled" } };

    return null;
  }
}

export type AgentTurnTerminalEvent = {
  type: "message_committed" | "turn_done";
  payload: Record<string, unknown>;
};
