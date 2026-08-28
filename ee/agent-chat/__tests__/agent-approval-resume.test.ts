import type { ModelMessage } from "ai";

import { describe, expect, it } from "vitest";

import {
  agentApprovalHookToken,
  agentApprovalId,
  agentApprovalRequestId,
  isRelevantAgentApprovalWake,
  pendingApprovalCalls,
  toolApprovalDecisionForGrant,
  withApprovalResponses,
} from "../agent-approval-resume";

function assistantWithCalls(...calls: { id: string; name: string }[]): ModelMessage {
  return {
    role: "assistant",
    content: calls.map((call) => ({
      type: "tool-call",
      toolCallId: call.id,
      toolName: call.name,
      input: { id: call.id },
    })),
  } as ModelMessage;
}

function toolResults(...ids: string[]): ModelMessage {
  return {
    role: "tool",
    content: ids.map((id) => ({
      type: "tool-result",
      toolCallId: id,
      toolName: "list_records",
      output: { type: "json", value: { ok: true } },
    })),
  } as ModelMessage;
}

describe("agent approval resume", () => {
  it("ignores a stale retry while accepting the current request or cancellation", () => {
    const current = new Set(["turn-2:tool-2"]);

    expect(isRelevantAgentApprovalWake({ requestId: "turn-1:tool-1" }, current)).toBe(false);
    expect(isRelevantAgentApprovalWake({ requestId: "turn-2:tool-2" }, current)).toBe(true);
    expect(isRelevantAgentApprovalWake({ cancelled: true }, current)).toBe(true);
  });

  it("treats only tool calls without a result as awaiting approval", () => {
    const messages = [
      { role: "system", content: "instructions" },
      { role: "user", content: "do it" },
      assistantWithCalls({ id: "read", name: "list_records" }),
      toolResults("read"),
      assistantWithCalls({ id: "wipe", name: "delete_records" }),
    ] as ModelMessage[];

    expect(pendingApprovalCalls(messages)).toEqual([
      { toolCallId: "wipe", toolName: "delete_records", input: { id: "wipe" } },
    ]);
  });

  it("reports nothing pending once every call has an outcome", () => {
    const messages = [
      { role: "user", content: "do it" },
      assistantWithCalls({ id: "read", name: "list_records" }),
      toolResults("read"),
    ] as ModelMessage[];

    expect(pendingApprovalCalls(messages)).toEqual([]);
  });

  it("drops the system message, because the agent rejects one in the prompt", () => {
    const resumed = withApprovalResponses(
      [
        { role: "system", content: "instructions" },
        { role: "user", content: "do it" },
        assistantWithCalls({ id: "wipe", name: "delete_records" }),
      ] as ModelMessage[],
      [{ toolCallId: "wipe", decision: "approve" }],
    );

    expect(resumed.some((message) => message.role === "system")).toBe(false);
  });

  it("pairs each response with a request on the assistant message that made the call", () => {
    const resumed = withApprovalResponses(
      [
        { role: "user", content: "do it" },
        assistantWithCalls({ id: "wipe", name: "delete_records" }),
      ] as ModelMessage[],
      [{ toolCallId: "wipe", decision: "approve" }],
    );

    const assistant = resumed.at(-2) as {
      content: { type: string; approvalId?: string }[];
    };
    const responses = resumed.at(-1) as {
      role: string;
      content: { type: string; approvalId: string; approved: boolean }[];
    };

    expect(assistant.content).toContainEqual({
      type: "tool-approval-request",
      approvalId: agentApprovalId("wipe"),
      toolCallId: "wipe",
    });
    expect(responses.role).toBe("tool");
    expect(responses.content).toEqual([
      {
        type: "tool-approval-response",
        approvalId: agentApprovalId("wipe"),
        approved: true,
      },
    ]);
  });

  it("merges responses into a trailing tool message rather than starting a second one", () => {
    const resumed = withApprovalResponses(
      [
        { role: "user", content: "do it" },
        assistantWithCalls({ id: "read", name: "list_records" }, { id: "wipe", name: "delete_records" }),
        toolResults("read"),
      ] as ModelMessage[],
      [{ toolCallId: "wipe", decision: "reject" }],
    );

    const last = resumed.at(-1) as {
      role: string;
      content: { type: string; approved?: boolean }[];
    };
    expect(resumed.filter((message) => message.role === "tool")).toHaveLength(1);
    expect(last.content.map((part) => part.type)).toEqual(["tool-result", "tool-approval-response"]);
    expect(last.content.at(-1)?.approved).toBe(false);
  });

  it("carries a refusal for every decision that is not an approval", () => {
    const resumed = withApprovalResponses(
      [
        { role: "user", content: "do it" },
        assistantWithCalls({ id: "wipe", name: "delete_records" }),
      ] as ModelMessage[],
      [{ toolCallId: "wipe", decision: "timeout" }],
    );

    const responses = resumed.at(-1) as { content: { approved: boolean }[] };
    expect(responses.content[0].approved).toBe(false);
  });

  it("refuses a tool that reaches execution without a granted approval", () => {
    expect(toolApprovalDecisionForGrant("approve")).toBe("approve");
    expect(toolApprovalDecisionForGrant("not-required")).toBe("reject");
  });

  it("keys the resume hook by conversation, so one active run owns the token", () => {
    expect(agentApprovalHookToken("conv-1")).toBe("agent-approval:conv-1");
    expect(agentApprovalHookToken("conv-1")).not.toBe(agentApprovalHookToken("conv-2"));
  });

  it("keys an approval request by turn and tool call, so a replay rebuilds the same id", () => {
    expect(agentApprovalRequestId("turn-1", "call-1")).toBe("turn-1:call-1");
  });
});
