import type { UIMessage } from "ai";

import { convertToModelMessages } from "ai";
import { describe, expect, it } from "vitest";

import { repairDanglingToolCalls } from "../sanitize-messages";

const user = (id: string, text: string): UIMessage =>
  ({ id, role: "user", parts: [{ type: "text", text }] }) as UIMessage;

const assistantWith = (id: string, parts: unknown[]): UIMessage =>
  ({ id, role: "assistant", parts }) as unknown as UIMessage;

const toolPart = (state: string, extra: Record<string, unknown> = {}) => ({
  type: "tool-navigate",
  toolCallId: "c1",
  state,
  input: { route: "/deals" },
  ...extra,
});

// Every tool_use the model sees must have a matching tool_result, or Anthropic 400s.
async function danglingToolUseIds(history: UIMessage[]): Promise<string[]> {
  const modelMessages = await convertToModelMessages(history);
  const used = new Set<string>();
  const resulted = new Set<string>();
  for (const message of modelMessages) {
    if (!Array.isArray(message.content)) continue;
    for (const content of message.content as Array<{ type: string; toolCallId?: string }>) {
      if (content.type === "tool-call" && content.toolCallId) used.add(content.toolCallId);
      if (content.type === "tool-result" && content.toolCallId) resulted.add(content.toolCallId);
    }
  }
  return [...used].filter((id) => !resulted.has(id));
}

describe("repairDanglingToolCalls", () => {
  it("repairs an input-available orphan into a paired output-error", () => {
    const messages = [user("u1", "tour"), assistantWith("a1", [toolPart("input-available")]), user("u2", "now delete")];

    const a1 = repairDanglingToolCalls(messages).find((m) => m.id === "a1");
    const repaired = a1?.parts[0] as { state: string; errorText?: string } | undefined;

    expect(repaired?.state).toBe("output-error");
    expect(repaired?.errorText).toBeTruthy();
  });

  it("strips the approval marker when repairing an approval-requested orphan", () => {
    const messages = [
      user("u1", "delete x"),
      assistantWith("a1", [toolPart("approval-requested", { approval: { id: "ap1" } })]),
      user("u2", "never mind"),
    ];

    const a1 = repairDanglingToolCalls(messages).find((m) => m.id === "a1");
    const part = a1?.parts[0] as { state: string; approval?: unknown } | undefined;

    expect(part?.state).toBe("output-error");
    expect(part?.approval).toBeUndefined();
  });

  it("leaves resolved calls, approval responses, text and user messages untouched", () => {
    const messages = [
      user("u1", "find deals"),
      assistantWith("a1", [{ type: "text", text: "Here you go" }, toolPart("output-available", { output: "[]" })]),
      assistantWith("a2", [
        toolPart("approval-responded", { approval: { id: "ap1", approved: true } }), // legit approve-resubmit
      ]),
    ];

    expect(repairDanglingToolCalls(messages)).toEqual(messages);
  });

  it("drops an input-streaming part and removes the now-empty assistant message", () => {
    const messages = [user("u1", "x"), assistantWith("a1", [toolPart("input-streaming")]), user("u2", "y")];

    const result = repairDanglingToolCalls(messages);

    expect(result.map((m) => m.id)).toEqual(["u1", "u2"]);
  });

  it("eliminates the dangling tool_use that would 400 (integration with convertToModelMessages)", async () => {
    const messages = [user("u1", "tour"), assistantWith("a1", [toolPart("input-available")]), user("u2", "delete all")];

    expect(await danglingToolUseIds(messages)).toEqual(["c1"]); // before: dangling
    expect(await danglingToolUseIds(repairDanglingToolCalls(messages))).toEqual([]); // after: paired
  });
});
