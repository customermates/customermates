import { AGENT_ACTIVITY_RESOURCES, type AgentActivityResource } from "./agent-activity";

export const AGENT_TURN_REQUEST_STATUSES = ["running", "completed", "failed", "uncertain"] as const;
export const AGENT_TURN_TERMINAL_CODES = ["completed", "partial", "error", "cancelled", "policyBreach"] as const;
export const AGENT_RUN_LEASE_MS = 330_000;

export type AgentTurnRequestStatus = (typeof AGENT_TURN_REQUEST_STATUSES)[number];
export type AgentTurnTerminalCode = (typeof AGENT_TURN_TERMINAL_CODES)[number];

export type AgentTurnRequestSnapshot = {
  id: string;
  conversationId: string;
  clientRequestId: string;
  text: string;
  pageRoute: string | null;
  status: AgentTurnRequestStatus;
  runId: string;
  attemptCount: number;
  providerStartedAt: Date | null;
  userMessageId: string;
  assistantMessageId: string | null;
  terminalCode: AgentTurnTerminalCode | null;
  affectedResources: AgentActivityResource[];
  hasLaterMessages: boolean;
};

export type AgentTurnRequestInput = {
  clientRequestId: string;
  conversationId?: string;
  text: string;
  pageRoute: string | null;
  retry: boolean;
};

export type AgentTurnAdmissionDecision =
  | { disposition: "new" }
  | { disposition: "retry"; turn: AgentTurnRequestSnapshot }
  | { disposition: "completed"; turn: AgentTurnRequestSnapshot }
  | {
      disposition: "running" | "failed" | "uncertain";
      turn: AgentTurnRequestSnapshot;
    }
  | { disposition: "conflict" };

function sameRequest(turn: AgentTurnRequestSnapshot, input: AgentTurnRequestInput) {
  return (
    turn.clientRequestId === input.clientRequestId &&
    turn.text === input.text &&
    turn.pageRoute === input.pageRoute &&
    (!input.conversationId || turn.conversationId === input.conversationId)
  );
}

export function decideAgentTurnAdmission(
  turn: AgentTurnRequestSnapshot | null,
  input: AgentTurnRequestInput,
): AgentTurnAdmissionDecision {
  if (!turn) return input.retry ? { disposition: "conflict" } : { disposition: "new" };
  if (!sameRequest(turn, input)) return { disposition: "conflict" };

  if (turn.status === "completed")
    return turn.assistantMessageId ? { disposition: "completed", turn } : { disposition: "uncertain", turn };

  if (turn.status === "running") return { disposition: "running", turn };
  if (turn.status === "uncertain") return { disposition: "uncertain", turn };
  if (turn.providerStartedAt || turn.assistantMessageId) return { disposition: "uncertain", turn };
  if (!input.retry) return { disposition: "failed", turn };
  if (turn.hasLaterMessages) return { disposition: "conflict" };
  return { disposition: "retry", turn };
}

export function isAgentTurnTerminalCode(value: unknown): value is AgentTurnTerminalCode {
  return typeof value === "string" && AGENT_TURN_TERMINAL_CODES.some((code) => code === value);
}

export function areAgentTurnAffectedResources(value: unknown): value is AgentActivityResource[] {
  return (
    Array.isArray(value) &&
    value.length <= AGENT_ACTIVITY_RESOURCES.length &&
    new Set(value).size === value.length &&
    value.every(
      (resource) =>
        typeof resource === "string" && AGENT_ACTIVITY_RESOURCES.some((candidate) => candidate === resource),
    )
  );
}

export function isAgentTurnTerminalError(code: AgentTurnTerminalCode) {
  return code !== "completed";
}

export function terminalAgentTurnStatus(args: {
  canonicalTranscriptPersisted: boolean;
  providerStarted: boolean;
}): Exclude<AgentTurnRequestStatus, "running"> {
  if (args.canonicalTranscriptPersisted) return "completed";
  return args.providerStarted ? "uncertain" : "failed";
}
