import { describe, expect, it } from "vitest";
import { agentBatchContainsWebCall, isSuccessfulAgentWebResult } from "../agent-web-policy";

describe("routine web batch policy", () => {
  const mutation = { type: "tool-call", toolName: "manage_wiki_pages", toolCallId: "write-1" };
  it.each(["web_search", "read_public_page"])(
    "detects %s in either order of the complete assistant batch",
    (toolName) => {
      const web = { type: "tool-call", toolName, toolCallId: "web-1" };
      for (const content of [
        [web, mutation],
        [mutation, web],
      ])
        expect(agentBatchContainsWebCall([{ role: "assistant", content }], "write-1")).toBe(true);
    },
  );
  it("fails closed when current tool batch is missing", () => {
    expect(agentBatchContainsWebCall([], "write-1")).toBe(true);
    expect(agentBatchContainsWebCall(undefined, "write-1")).toBe(true);
  });
  it("does not mistake a previously failed web batch for the current write-only batch", () => {
    expect(
      agentBatchContainsWebCall(
        [
          { role: "assistant", content: [{ type: "tool-call", toolName: "web_search", toolCallId: "old" }] },
          { role: "tool", content: [{ type: "tool-result", output: { type: "error-text", value: "failed" } }] },
          { role: "assistant", content: [mutation] },
        ],
        "write-1",
      ),
    ).toBe(false);
  });
  it.each([{ results: [] }, { type: "json", value: { results: [{ url: "https://example.com" }] } }, { ok: true }])(
    "recognizes successful provider/direct results",
    (result) => {
      expect(isSuccessfulAgentWebResult(result)).toBe(true);
    },
  );
  it.each([null, { ok: false }, { error: "failed", results: [] }, { type: "error-json", value: { results: [] } }])(
    "does not make a failed browse sticky",
    (result) => {
      expect(isSuccessfulAgentWebResult(result)).toBe(false);
    },
  );
});
