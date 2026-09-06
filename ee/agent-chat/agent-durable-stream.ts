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

const TOOL_ERROR_OUTPUT_TYPES: ReadonlySet<string> = new Set(["error-text", "error-json"]);

export function isAgentToolErrorOutput(output: unknown): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const type = (output as { type?: unknown }).type;
  return typeof type === "string" && TOOL_ERROR_OUTPUT_TYPES.has(type);
}

export function agentToolOutcomeStatus(output: unknown): {
  status: AgentActivityStatus;
  failed: boolean;
} {
  if (isAgentToolCancellation(output)) return { status: "cancelled", failed: false };
  if (isAgentToolErrorOutput(output)) return { status: "error", failed: true };
  const unwrapped = unwrapToolOutput(output);
  const failed = Boolean(unwrapped && typeof unwrapped === "object" && (unwrapped as { ok?: unknown }).ok === false);
  return { status: failed ? "error" : "done", failed };
}

export function unwrapToolOutput(output: unknown) {
  if (isAgentToolErrorOutput(output)) return output;
  return output && typeof output === "object" && "value" in output ? (output as { value: unknown }).value : output;
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

    if (part.type === "model-call-start") return { type: "progress", payload: { phase: "working" } };

    if (part.type === "tool-input-start") return { type: "progress", payload: { phase: "preparing_action" } };

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
