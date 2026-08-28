import type { ApprovalDecision } from "./agent-tools";
import type { ModelMessage } from "ai";

export type ToolApprovalGrant = "approve" | "not-required";

export type AgentApprovalOutcome = {
  toolCallId: string;
  decision: "approve" | "reject" | "timeout";
};

export type AgentApprovalWake = { requestId?: string; cancelled?: boolean };

export type PendingApprovalCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export function agentApprovalHookToken(conversationId: string) {
  return `agent-approval:${conversationId}`;
}

export function agentApprovalId(toolCallId: string) {
  return `approval-${toolCallId}`;
}

export function agentApprovalRequestId(turnRequestId: string, toolCallId: string) {
  return `${turnRequestId}:${toolCallId}`;
}

export function isRelevantAgentApprovalWake(wake: AgentApprovalWake, requestIds: ReadonlySet<string>) {
  return wake.cancelled === true || (typeof wake.requestId === "string" && requestIds.has(wake.requestId));
}

export function toolApprovalDecisionForGrant(grant: ToolApprovalGrant): ApprovalDecision {
  return grant === "approve" ? "approve" : "reject";
}

export function pendingApprovalCalls(messages: ModelMessage[]): PendingApprovalCall[] {
  const settled = new Set<string>();
  for (const message of messages) {
    if (message.role !== "tool" || typeof message.content === "string") continue;
    for (const part of message.content) if (part.type === "tool-result") settled.add(part.toolCallId);
  }

  const pending: PendingApprovalCall[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    for (const part of message.content) {
      if (part.type === "tool-call" && !settled.has(part.toolCallId)) {
        pending.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      }
    }
  }

  return pending;
}

export function withApprovalResponses(messages: ModelMessage[], outcomes: AgentApprovalOutcome[]): ModelMessage[] {
  const next: ModelMessage[] = messages.filter((message) => message.role !== "system");

  let assistantIndex = -1;
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.role === "assistant" && typeof message.content !== "string") {
      assistantIndex = index;
      break;
    }
  }
  if (assistantIndex < 0) return next;

  const assistant = next[assistantIndex] as Extract<ModelMessage, { role: "assistant" }>;
  next[assistantIndex] = {
    ...assistant,
    content: [
      ...(assistant.content as object[]),
      ...outcomes.map((outcome) => ({
        type: "tool-approval-request" as const,
        approvalId: agentApprovalId(outcome.toolCallId),
        toolCallId: outcome.toolCallId,
      })),
    ],
  } as ModelMessage;

  const responses = outcomes.map((outcome) => ({
    type: "tool-approval-response" as const,
    approvalId: agentApprovalId(outcome.toolCallId),
    approved: outcome.decision === "approve",
  }));

  const last = next.at(-1);
  if (last?.role === "tool" && typeof last.content !== "string") {
    next[next.length - 1] = {
      ...last,
      content: [...(last.content as object[]), ...responses],
    } as ModelMessage;
  } else next.push({ role: "tool", content: responses } as unknown as ModelMessage);

  return next;
}

export type AgentToolResumeResult = {
  toolCallId: string;
  toolName: string;
  output: unknown;
};

export function withToolResults(messages: ModelMessage[], results: AgentToolResumeResult[]): ModelMessage[] {
  const next: ModelMessage[] = messages.filter((message) => message.role !== "system");
  if (results.length === 0) return next;

  const parts = results.map((result) => ({
    type: "tool-result" as const,
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    output: { type: "json" as const, value: result.output as never },
  }));

  const last = next.at(-1);
  if (last?.role === "tool" && typeof last.content !== "string") {
    next[next.length - 1] = {
      ...last,
      content: [...(last.content as object[]), ...parts],
    } as ModelMessage;
  } else next.push({ role: "tool", content: parts } as unknown as ModelMessage);

  return next;
}
