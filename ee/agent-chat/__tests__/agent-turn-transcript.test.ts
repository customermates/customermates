import { describe, expect, it } from "vitest";

import type { AgentActivityDescriptor } from "../agent-activity";

import { AgentTurnTranscript, type AgentTranscriptEvent } from "../agent-turn-transcript";

function activity(overrides: Partial<AgentActivityDescriptor> = {}): AgentActivityDescriptor {
  return {
    kind: "records.create",
    risk: "write",
    affectedResources: ["contacts"],
    ...overrides,
  } as AgentActivityDescriptor;
}

function transcriptWithLog() {
  const events: AgentTranscriptEvent[] = [];
  return { events, transcript: new AgentTurnTranscript((event) => events.push(event)) };
}

describe("agent turn transcript", () => {
  it("interleaves visible text with activities in the order they happened", () => {
    const { events, transcript } = transcriptWithLog();

    transcript.pushTextDelta("Creating ");
    transcript.beginToolCall({ toolCallId: "call-1", toolName: "create_contacts", activity: activity() });
    transcript.completeToolCall({ toolCallId: "call-1", toolName: "create_contacts", status: "done", failed: false });
    transcript.pushTextDelta("Done.");
    transcript.finishTextSegment();

    expect(transcript.replyParts).toEqual([
      { type: "text", text: "Creating " },
      { type: "activity", id: "call-1", activity: activity(), status: "done" },
      { type: "text", text: "Done." },
    ]);
    expect(events.map((event) => event.type)).toEqual(["delta", "activity", "activity_result", "delta"]);
  });

  it("collects affected resources only from writes that actually succeeded", () => {
    const { transcript } = transcriptWithLog();

    transcript.beginToolCall({ toolCallId: "ok", toolName: "create_contacts", activity: activity() });
    transcript.completeToolCall({ toolCallId: "ok", toolName: "create_contacts", status: "done", failed: false });

    transcript.beginToolCall({
      toolCallId: "failed",
      toolName: "create_deals",
      activity: activity({ affectedResources: ["deals"] }),
    });
    transcript.completeToolCall({ toolCallId: "failed", toolName: "create_deals", status: "error", failed: true });

    transcript.beginToolCall({
      toolCallId: "read",
      toolName: "list_records",
      activity: activity({ risk: "read", affectedResources: ["services"] }),
    });
    transcript.completeToolCall({ toolCallId: "read", toolName: "list_records", status: "done", failed: false });

    expect(transcript.affectedResources).toEqual(["contacts"]);
  });

  it("replaces a failed call with its retry rather than showing both", () => {
    const { events, transcript } = transcriptWithLog();

    transcript.beginToolCall({ toolCallId: "first", toolName: "create_contacts", activity: activity() });
    transcript.completeToolCall({ toolCallId: "first", toolName: "create_contacts", status: "error", failed: true });
    transcript.beginToolCall({ toolCallId: "second", toolName: "create_contacts", activity: activity() });
    transcript.completeToolCall({ toolCallId: "second", toolName: "create_contacts", status: "done", failed: false });

    expect(transcript.replyParts).toEqual([{ type: "activity", id: "second", activity: activity(), status: "done" }]);
    expect(events.filter((event) => event.type === "activity_superseded")).toEqual([
      { type: "activity_superseded", payload: { id: "first" } },
    ]);
  });

  it("supersedes only the same tool, so an unrelated failure stays visible", () => {
    const { transcript } = transcriptWithLog();

    transcript.beginToolCall({ toolCallId: "deal", toolName: "create_deals", activity: activity() });
    transcript.completeToolCall({ toolCallId: "deal", toolName: "create_deals", status: "error", failed: true });
    transcript.beginToolCall({ toolCallId: "contact", toolName: "create_contacts", activity: activity() });

    expect(transcript.replyParts.map((part) => "id" in part && part.id)).toEqual(["deal", "contact"]);
  });

  it("reports an invalid tool call once, so it is not captured twice", () => {
    const { transcript } = transcriptWithLog();

    transcript.beginToolCall({ toolCallId: "bad", toolName: "create_contacts", activity: activity(), invalid: true });
    expect(transcript.failToolCall("bad")).toEqual({ wasInvalidToolCall: true });
    expect(transcript.failToolCall("bad")).toEqual({ wasInvalidToolCall: false });
  });

  it("settles every still-running tool when the turn ends early", () => {
    const { events, transcript } = transcriptWithLog();

    transcript.beginToolCall({ toolCallId: "running", toolName: "create_contacts", activity: activity() });
    transcript.beginToolCall({ toolCallId: "settled", toolName: "create_deals", activity: activity() });
    transcript.completeToolCall({ toolCallId: "settled", toolName: "create_deals", status: "done", failed: false });
    events.length = 0;

    transcript.failUnfinishedTools("cancelled", true);

    expect(transcript.replyParts).toContainEqual(expect.objectContaining({ id: "running", status: "cancelled" }));
    expect(transcript.replyParts).toContainEqual(expect.objectContaining({ id: "settled", status: "done" }));
    expect(events).toEqual([{ type: "activity_result", payload: { id: "running", isError: true } }]);
  });

  it("tracks an approval from request through to its decision", () => {
    const { events, transcript } = transcriptWithLog();

    transcript.beginApproval("req-1", activity({ risk: "sensitive" }));
    expect(transcript.replyParts).toEqual([
      { type: "approval", id: "req-1", activity: activity({ risk: "sensitive" }), status: "pending" },
    ]);

    transcript.resolveApproval("req-1", "approved", "approve");
    expect(transcript.replyParts[0]).toMatchObject({ status: "approved" });
    expect(events.at(-1)).toEqual({
      type: "approval_resolved",
      payload: { requestId: "req-1", decision: "approve" },
    });

    transcript.setApprovalStatus("req-1", "cancelled");
    expect(transcript.replyParts[0]).toMatchObject({ status: "cancelled" });
    expect(events.at(-1)?.type).toBe("approval_resolved");
  });
});
