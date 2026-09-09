import type { AgentActivityStatus } from "./agent-turn-transcript";

import { describeAgentTool } from "./agent-activity";
import { internalToolIdentity } from "./tool-identity";
import { isAgentToolCancellation } from "./agent-tool-cancellation";

export const AGENT_TRANSCRIPT_FORWARDED_EVENTS = [
  "activity_superseded",
  "approval_request",
  "approval_resolved",
] as const;

export const AGENT_CLIENT_PASSTHROUGH_EVENTS = [
  ...AGENT_TRANSCRIPT_FORWARDED_EVENTS,
  "delta",
  "activity_result",
  "ui_command",
  "message_committed",
  "turn_done",
] as const;

export type AgentClientEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export function agentToolOutcomeStatus(output: unknown): {
  status: AgentActivityStatus;
  failed: boolean;
} {
  if (output && typeof output === "object") {
    const envelope = output as { type?: unknown; value?: unknown };
    if (envelope.type === "error-json" || envelope.type === "error-text") return { status: "error", failed: true };
    if (envelope.type === "execution-denied") return { status: "cancelled", failed: false };
    if ((envelope.type === "json" || envelope.type === "text") && "value" in envelope)
      return agentToolOutcomeStatus(envelope.value);
  }
  if (isAgentToolCancellation(output)) return { status: "cancelled", failed: false };
  const failed = Boolean(output && typeof output === "object" && (output as { ok?: unknown }).ok === false);
  return { status: failed ? "error" : "done", failed };
}

export class AgentDurableStreamReader {
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

    if (part.type && (AGENT_CLIENT_PASSTHROUGH_EVENTS as readonly string[]).includes(part.type) && part.payload)
      return { type: part.type, payload: part.payload ?? {} };

    if (part.type === "text-delta" && part.text) return { type: "delta", payload: { text: part.text } };

    if (part.type === "tool-call" && part.toolCallId && part.toolName) {
      return {
        type: "activity",
        payload: {
          id: part.toolCallId,
          activity: describeAgentTool(internalToolIdentity(part.toolName), part.input),
        },
      };
    }

    if (part.type === "tool-result" && part.toolCallId) {
      const { status, failed } = agentToolOutcomeStatus(part.output);
      return {
        type: "activity_result",
        payload: { id: part.toolCallId, isError: failed, status },
      };
    }

    if (part.type === "tool-error" && part.toolCallId) {
      return {
        type: "activity_result",
        payload: { id: part.toolCallId, isError: true, status: "error" },
      };
    }

    if (part.type === "tool-output-denied" && part.toolCallId) {
      return {
        type: "activity_result",
        payload: { id: part.toolCallId, isError: false, status: "cancelled" },
      };
    }

    return null;
  }
}

export type AgentTurnTerminalEvent = {
  type: "message_committed" | "turn_done";
  payload: Record<string, unknown>;
};
