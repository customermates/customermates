import { describe, expect, it } from "vitest";

import { recordedToolOutputs } from "../episode";

describe("benchmark episode tool outputs", () => {
  it("aligns recorded outputs with the tool calls in call order", () => {
    const parts = [
      { type: "text", text: "Looking." },
      { type: "tool-call", toolCallId: "a", toolName: "list_records", input: {} },
      { type: "tool-call", toolCallId: "b", toolName: "get_records", input: {} },
      {
        type: "benchmark-tool-output",
        toolCallId: "b",
        toolName: "get_records",
        threw: false,
        ok: true,
        text: "name: Nova",
        textChars: 10,
        truncated: false,
      },
      { type: "tool-call", toolCallId: "c", toolName: "navigate", input: {} },
      {
        type: "benchmark-tool-output",
        toolCallId: "a",
        toolName: "list_records",
        threw: false,
        ok: true,
        text: "total: 42",
        textChars: 9,
        truncated: false,
        structuredContent: { total: 42 },
      },
    ];

    expect(recordedToolOutputs(parts)).toEqual([
      {
        toolCallId: "a",
        toolName: "list_records",
        threw: false,
        ok: true,
        text: "total: 42",
        textChars: 9,
        truncated: false,
        structuredContent: { total: 42 },
      },
      {
        toolCallId: "b",
        toolName: "get_records",
        threw: false,
        ok: true,
        text: "name: Nova",
        textChars: 10,
        truncated: false,
      },
      null,
    ]);
  });

  it("returns only nulls for rounds recorded without outputs", () => {
    expect(recordedToolOutputs([{ type: "tool-call", toolCallId: "a", toolName: "list_records" }])).toEqual([null]);
  });
});
