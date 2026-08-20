import { describe, expect, it } from "vitest";

import { sse, toModelMessages } from "../agent-stream-utils";

describe("toModelMessages", () => {
  it("does not mislabel ordinary assistant replies", () => {
    expect(
      toModelMessages([
        { role: "user", text: "Hello" },
        { role: "assistant", text: "How can I help?" },
      ]),
    ).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "How can I help?" },
    ]);
  });

  it("revalidates canonical message replays at the SSE boundary", () => {
    const event = new TextDecoder().decode(
      sse(1, "message_replay", {
        messageId: "assistant-1",
        createdAt: "2026-08-06T10:00:00.000Z",
        parts: [
          {
            type: "text",
            text: '<page_context route="/private"/>Done 00000000-0000-4000-8000-000000000001.',
          },
          { type: "reasoning", text: "hidden chain of thought" },
          { type: "tool_result", output: { apiKey: "never-show" } },
        ],
        providerMetadata: { modelId: "gpt-5.6-luna", inputTokens: 321 },
      }),
    );

    expect(event).toContain('"type":"message_replay"');
    expect(event).toContain("[internal reference]");
    expect(event).not.toMatch(
      /page_context|00000000|reasoning|tool_result|never-show|providerMetadata|gpt-5\.6|inputTokens|321/,
    );
  });
});
