import { describe, expect, it } from "vitest";

import {
  AGENT_DURABLE_MAX_ERRORS,
  AGENT_DURABLE_MAX_REPEATED_ACTIVITY_CALLS,
  agentDurableContinuationLimits,
  toAgentContinuationStep,
} from "../agent-durable-limits";
import { decideAgentContinuationLoop, summarizeAgentContinuationStep } from "../agent-continuation";

const limits = agentDurableContinuationLimits(200);

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
  return decideAgentContinuationLoop({ startedAtMs: 0, steps, observedAtMs: 0 }, limits);
}

describe("durable continuation limits", () => {
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

  it("stops a model that keeps failing the same way", () => {
    const failing = () => round("create_contacts", { name: "x" }, { ok: false, result: "not allowed" });
    const steps = Array.from({ length: AGENT_DURABLE_MAX_ERRORS }, failing);

    expect(decide(steps)).toMatchObject({ action: "error", reason: "error_limit" });
  });

  it("stops a model that keeps making the same call", () => {
    const repeat = () => round("list_records", { entity: "contact" }, { ok: true, result: "items" });
    const steps = Array.from({ length: AGENT_DURABLE_MAX_REPEATED_ACTIVITY_CALLS }, repeat);

    expect(decide(steps)).toMatchObject({ action: "error", reason: "repeated_activity" });
  });

  it("lets genuine progress continue well past any request-bound ceiling", () => {
    const steps = Array.from({ length: 60 }, (_, index) =>
      round("list_records", { entity: "contact", page: index }, { ok: true, result: `page ${index}` }),
    );

    expect(decide(steps).action).toBe("continue");
  });

  it("never stops a durable run for taking too long, which is the point of durability", () => {
    const steps = [round("list_records", { entity: "contact" }, { ok: true, result: "items" })];
    const decision = decideAgentContinuationLoop(
      { startedAtMs: 0, steps, observedAtMs: Number.MAX_SAFE_INTEGER - 1 },
      limits,
    );

    expect(decision.action).toBe("continue");
  });
});
