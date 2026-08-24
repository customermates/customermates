import { describe, expect, it } from "vitest";

import {
  AGENT_TRANSCRIPT_FORWARDED_EVENTS,
  AgentDurableStreamReader,
  agentToolOutcomeStatus,
} from "../agent-durable-stream";

function read(chunks: unknown[]) {
  const reader = new AgentDurableStreamReader();
  return chunks.map((chunk) => reader.read(chunk)).filter((event) => event !== null);
}

describe("agent durable stream reader", () => {
  it("turns a tool call into a running activity before the tool has executed", () => {
    expect(
      read([{ type: "tool-call", toolCallId: "call-1", toolName: "list_records", input: { entity: "contact" } }]),
    ).toEqual([
      {
        type: "activity",
        payload: {
          id: "call-1",
          activity: expect.objectContaining({ kind: "records.read", resource: "contacts" }),
        },
      },
    ]);
  });

  it("never forwards raw tool output, which would put record data in the browser", () => {
    const events = read([
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "list_records",
        output: { ok: true, result: "ada@example.com, +49 170 1234567" },
      },
    ]);

    expect(events).toEqual([{ type: "activity_result", payload: { id: "call-1", isError: false, status: "done" } }]);
    expect(JSON.stringify(events)).not.toContain("ada@example.com");
  });

  it("never forwards model identifiers, usage or cost", () => {
    const events = read([
      { type: "model-call-start", model: "openai/gpt-5.6-luna" },
      { type: "model-call-end", usage: { inputTokens: 100 }, providerMetadata: { gateway: { cost: "0.004" } } },
      { type: "model-call-response-metadata", modelId: "gpt-5.6-luna" },
      { type: "finish-step", usage: { outputTokens: 20 } },
      { type: "reset-step" },
      { type: "tool-input-delta", delta: '{"entity"' },
    ]);

    expect(events).toEqual([]);
  });

  it("reports a structured tool failure as an error the user can see", () => {
    expect(read([{ type: "tool-result", toolCallId: "call-1", output: { ok: false, result: "not allowed" } }])).toEqual(
      [{ type: "activity_result", payload: { id: "call-1", isError: true, status: "error" } }],
    );
  });

  it("reports a declined tool as cancelled rather than an error", () => {
    expect(
      read([
        {
          type: "tool-result",
          toolCallId: "call-1",
          output: { agentToolStatus: "cancelled", reason: "rejected", message: "declined" },
        },
      ]),
    ).toEqual([{ type: "activity_result", payload: { id: "call-1", isError: false, status: "cancelled" } }]);
    expect(read([{ type: "tool-output-denied", toolCallId: "call-2" }])).toEqual([
      { type: "activity_result", payload: { id: "call-2", isError: false, status: "cancelled" } },
    ]);
  });

  it("unwraps a tool output that arrives in the provider's json envelope", () => {
    expect(
      read([{ type: "tool-result", toolCallId: "call-1", output: { type: "json", value: { ok: false } } }]),
    ).toEqual([{ type: "activity_result", payload: { id: "call-1", isError: true, status: "error" } }]);
  });

  it("passes through the workflow events the client cannot derive itself", () => {
    expect(
      read([
        { type: "approval_request", payload: { requestId: "turn:call-1", activity: { kind: "records.delete" } } },
        { type: "approval_resolved", payload: { requestId: "turn:call-1", decision: "approve" } },
        { type: "activity_superseded", payload: { id: "call-0" } },
        { type: "ui_command", payload: { commandId: "call-9", name: "navigate", input: {} } },
        { type: "activity_result", payload: { id: "call-9", isError: false, status: "done" } },
        { type: "turn_done", payload: { terminalCode: "completed" } },
        { type: "activity", payload: { id: "call-9" } },
      ]).map((event) => event?.type),
    ).toEqual([
      "approval_request",
      "approval_resolved",
      "activity_superseded",
      "ui_command",
      "activity_result",
      "turn_done",
    ]);
  });

  it("never lets the transcript forward an activity the client already derives, which would double it", () => {
    expect(AGENT_TRANSCRIPT_FORWARDED_EVENTS).not.toContain("activity");
    expect(AGENT_TRANSCRIPT_FORWARDED_EVENTS).not.toContain("activity_result");
  });

  it("streams assistant text through as deltas", () => {
    expect(read([{ type: "text-delta", text: "Hello" }, { type: "text-start" }, { type: "text-end" }])).toEqual([
      { type: "delta", payload: { text: "Hello" } },
    ]);
  });

  it("shares one outcome rule with the persisted transcript", () => {
    expect(agentToolOutcomeStatus({ ok: true })).toEqual({ status: "done", failed: false });
    expect(agentToolOutcomeStatus({ ok: false })).toEqual({ status: "error", failed: true });
    expect(agentToolOutcomeStatus({ agentToolStatus: "cancelled", reason: "timeout", message: "x" })).toEqual({
      status: "cancelled",
      failed: false,
    });
  });
});
