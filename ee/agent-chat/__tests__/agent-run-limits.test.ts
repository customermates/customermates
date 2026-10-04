import { describe, expect, it } from "vitest";

import { toAgentContinuationStep } from "../agent-run-limits";
import { decideAgentContinuationLoop, summarizeAgentContinuationStep } from "../agent-continuation";

function round(toolName: string, input: unknown, output: unknown) {
  return toAgentContinuationStep(
    {
      finishReason: "tool-calls",
      content: [{ type: "tool-call", toolCallId: `call-${toolName}-${JSON.stringify(input)}`, toolName, input }],
    },
    [{ toolCallId: `call-${toolName}-${JSON.stringify(input)}`, toolName, output }],
  );
}

function decide(steps: ReturnType<typeof round>[]) {
  return decideAgentContinuationLoop({ steps });
}

describe("credit-bounded durable continuation", () => {
  it("reads a succeeded tool as done, because the durable step carries no result of its own", () => {
    const step = round("list_records", { entity: "contact" }, { ok: true, result: "items" });

    expect(summarizeAgentContinuationStep(step).map((activity) => activity.status)).toEqual(["done"]);
    expect(decide([step]).action).toBe("continue");
  });

  it("reads a structured failure as an error and a decline as cancelled", () => {
    const failed = round("create_contacts", { name: "x" }, { ok: false, result: "not allowed" });
    const declined = round(
      "delete_records",
      { ids: ["1"] },
      {
        agentToolStatus: "cancelled",
        reason: "rejected",
        message: "declined",
      },
    );

    expect(summarizeAgentContinuationStep(failed)[0]?.status).toBe("error");
    expect(summarizeAgentContinuationStep(declined)[0]?.status).toBe("cancelled");
  });

  it("reads a thrown tool as an error", () => {
    const step = toAgentContinuationStep(
      { finishReason: "tool-calls", content: [{ type: "tool-call", toolCallId: "c1", toolName: "send_email" }] },
      [{ toolCallId: "c1", toolName: "send_email", threw: true }],
    );

    expect(summarizeAgentContinuationStep(step)[0]?.status).toBe("error");
  });

  it("orders tool results by the round's calls, whatever order they settled in", () => {
    const step = toAgentContinuationStep(
      {
        finishReason: "tool-calls",
        content: [
          { type: "text", text: "Deleting both." },
          { type: "tool-call", toolCallId: "call-1", toolName: "delete_records", input: { ids: ["ada"] } },
          { type: "tool-call", toolCallId: "call-2", toolName: "delete_records", input: { ids: ["bob"] } },
        ],
      },
      [
        {
          toolCallId: "call-2",
          toolName: "delete_records",
          output: { ok: false, cancelled: true, result: "declined" },
        },
        { toolCallId: "call-1", toolName: "delete_records", output: { ok: true, result: "deleted" } },
      ],
    );
    const tool = step.response.messages.find((message) => message.role === "tool");

    expect((tool?.content as { toolCallId: string }[]).map((part) => part.toolCallId)).toEqual(["call-1", "call-2"]);
    expect(
      step.content
        .filter((part) => (part as { type?: string }).type === "tool-result")
        .map((part) => (part as { toolCallId: string }).toolCallId),
    ).toEqual(["call-1", "call-2"]);
  });

  it("carries a provider-executed search call and its result into the next segment's messages", () => {
    const call = { type: "tool-call", toolCallId: "web-1", toolName: "web_search", input: {}, providerExecuted: true };
    const output = { results: [{ url: "https://example.com/" }] };
    const partial = { type: "text", text: "Partial" };
    const step = toAgentContinuationStep(
      {
        finishReason: "length",
        content: [call, { ...call, type: "tool-result", output }, partial],
      },
      [{ toolCallId: "web-1", toolName: "web_search", output }],
    );

    expect(step.response.messages).toEqual([
      { role: "assistant", content: [call, partial] },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "web-1", toolName: "web_search", output: { type: "json", value: output } },
        ],
      },
    ]);
  });

  it("continues when a model keeps failing the same way", () => {
    const failing = () => round("create_contacts", { name: "x" }, { ok: false, result: "not allowed" });
    const steps = Array.from({ length: 40 }, failing);

    expect(decide(steps)).toEqual({ action: "continue" });
  });

  it("continues when a model keeps making the same call", () => {
    const repeat = () => round("list_records", { entity: "contact" }, { ok: true, result: "items" });
    const steps = Array.from({ length: 40 }, repeat);

    expect(decide(steps)).toEqual({ action: "continue" });
  });

  it("continues past 32 provider rounds and 16 successful writes", () => {
    const steps = Array.from({ length: 40 }, (_, index) =>
      round("create_contacts", { firstName: `Contact ${index}` }, { ok: true, result: `created ${index}` }),
    );

    expect(decide(steps)).toEqual({ action: "continue" });
  });

  it("never stops a durable run for taking too long, which is the point of durability", () => {
    const steps = [round("list_records", { entity: "contact" }, { ok: true, result: "items" })];
    const decision = decideAgentContinuationLoop({ steps });

    expect(decision.action).toBe("continue");
  });
});
