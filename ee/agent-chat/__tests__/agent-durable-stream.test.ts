import { describe, expect, it } from "vitest";

import {
  AGENT_TRANSCRIPT_FORWARDED_EVENTS,
  AgentDurableStreamReader,
  agentToolOutcomeStatus,
  unwrapToolOutput,
} from "../agent-durable-stream";

function read(chunks: unknown[]) {
  const reader = new AgentDurableStreamReader();
  return chunks.map((chunk) => reader.read(chunk)).filter((event) => event !== null);
}

describe("agent durable stream reader", () => {
  it("turns a tool call into a running activity before the tool has executed", () => {
    expect(
      read([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "list_records",
          input: { entity: "contact" },
        },
      ]),
    ).toEqual([
      {
        type: "activity",
        payload: {
          id: "call-1",
          activity: expect.objectContaining({
            kind: "records.read",
            resource: "contacts",
          }),
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

    expect(events).toEqual([
      {
        type: "activity_result",
        payload: { id: "call-1", isError: false, status: "done" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("ada@example.com");
  });

  it("never forwards model identifiers, usage or cost", () => {
    const events = read([
      {
        type: "model-call-end",
        usage: { inputTokens: 100 },
        providerMetadata: { gateway: { cost: "0.004" } },
      },
      { type: "model-call-response-metadata", modelId: "gpt-5.6-luna" },
      { type: "finish-step", usage: { outputTokens: 20 } },
      { type: "reset-step" },
      { type: "tool-input-delta", delta: '{"entity"' },
    ]);

    expect(events).toEqual([]);
  });

  it("derives enum-only progress without forwarding lifecycle metadata or reasoning", () => {
    const events = read([
      {
        type: "model-call-start",
        model: "private-model",
        warnings: ["private-warning"],
        payload: { secret: "secret" },
      },
      {
        type: "tool-input-start",
        id: "private-id",
        toolName: "private-tool",
        providerMetadata: { secret: "secret" },
      },
      { type: "reasoning-start", id: "private-reasoning" },
      { type: "reasoning-delta", text: "private-thought" },
      { type: "tool-input-delta", delta: "private-argument" },
      { type: "progress", payload: { phase: "private-untrusted-phase" } },
    ]);

    expect(events).toEqual([
      { type: "progress", payload: { phase: "working" } },
      { type: "progress", payload: { phase: "preparing_action" } },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/private|secret/);
  });

  it("reports a structured tool failure as an error the user can see", () => {
    expect(
      read([
        {
          type: "tool-result",
          toolCallId: "call-1",
          output: { ok: false, result: "not allowed" },
        },
      ]),
    ).toEqual([
      {
        type: "activity_result",
        payload: { id: "call-1", isError: true, status: "error" },
      },
    ]);
  });

  it("reports a declined tool as cancelled rather than an error", () => {
    expect(
      read([
        {
          type: "tool-result",
          toolCallId: "call-1",
          output: {
            agentToolStatus: "cancelled",
            reason: "rejected",
            message: "declined",
          },
        },
      ]),
    ).toEqual([
      {
        type: "activity_result",
        payload: { id: "call-1", isError: false, status: "cancelled" },
      },
    ]);
    expect(read([{ type: "tool-output-denied", toolCallId: "call-2" }])).toEqual([
      {
        type: "activity_result",
        payload: { id: "call-2", isError: false, status: "cancelled" },
      },
    ]);
  });

  it("unwraps a tool output that arrives in the provider's json envelope", () => {
    expect(
      read([
        {
          type: "tool-result",
          toolCallId: "call-1",
          output: { type: "json", value: { ok: false } },
        },
      ]),
    ).toEqual([
      {
        type: "activity_result",
        payload: { id: "call-1", isError: true, status: "error" },
      },
    ]);
  });

  it("passes through the workflow events the client cannot derive itself", () => {
    expect(
      read([
        {
          type: "approval_request",
          payload: {
            requestId: "turn:call-1",
            activity: { kind: "records.delete" },
          },
        },
        {
          type: "approval_resolved",
          payload: { requestId: "turn:call-1", decision: "approve" },
        },
        { type: "activity_superseded", payload: { id: "call-0" } },
        {
          type: "ui_command",
          payload: { commandId: "call-9", name: "navigate", input: {} },
        },
        { type: "delta", payload: { text: "Stopped early." } },
        {
          type: "activity_result",
          payload: { id: "call-9", isError: false, status: "done" },
        },
        { type: "turn_done", payload: { terminalCode: "completed" } },
        { type: "activity", payload: { id: "call-9" } },
      ]).map((event) => event?.type),
    ).toEqual([
      "approval_request",
      "approval_resolved",
      "activity_superseded",
      "ui_command",
      "delta",
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
    expect(agentToolOutcomeStatus({ ok: true })).toEqual({
      status: "done",
      failed: false,
    });
    expect(agentToolOutcomeStatus({ ok: false })).toEqual({
      status: "error",
      failed: true,
    });
    expect(
      agentToolOutcomeStatus({
        agentToolStatus: "cancelled",
        reason: "timeout",
        message: "x",
      }),
    ).toEqual({
      status: "cancelled",
      failed: false,
    });
  });
});

describe("runtime-rejected tool calls", () => {
  it("classifies an AI SDK error envelope as a failure instead of a silent success", () => {
    for (const type of ["error-text", "error-json"]) {
      const outcome = agentToolOutcomeStatus({ type, value: "Validation error: page must be a number" });
      expect(outcome, type).toEqual({ status: "error", failed: true });
    }
  });

  it("keeps the error envelope intact through the shared unwrap", () => {
    const envelope = { type: "error-text", value: "rejected" };
    expect(unwrapToolOutput(envelope)).toBe(envelope);
    expect(unwrapToolOutput({ type: "json", value: { ok: true } })).toEqual({ ok: true });
  });

  it("still classifies an ok:false result as a failure after unwrapping", () => {
    expect(agentToolOutcomeStatus({ type: "json", value: { ok: false, result: "denied" } })).toEqual({
      status: "error",
      failed: true,
    });
    expect(agentToolOutcomeStatus({ type: "json", value: { ok: true, result: "done" } })).toEqual({
      status: "done",
      failed: false,
    });
  });

  it("reports a rejected call to the client as an error", () => {
    const reader = new AgentDurableStreamReader();
    const event = reader.read({
      type: "tool-result",
      toolCallId: "call-1",
      output: { type: "error-text", value: "Validation error" },
    });
    expect(event).toEqual({
      type: "activity_result",
      payload: { id: "call-1", isError: true, status: "error" },
    });
  });
});
