import { describe, expect, it } from "vitest";
import {
  AGENT_WEB_PAGE_MAX_CALLS,
  agentBatchContainsWebCall,
  agentWebPageCallLimit,
  agentWebSourcesFooter,
  collectAgentWebSources,
  isAgentWebTool,
  isSuccessfulAgentWebResult,
} from "../agent-web-policy";

describe("routine web batch policy", () => {
  const mutation = { type: "tool-call", toolName: "manage_wiki_pages", toolCallId: "write-1" };
  it("treats only the page reader as web access", () => {
    expect(isAgentWebTool("read_web_page")).toBe(true);
    for (const name of ["web_search", "import_website", "search_docs", "manage_wiki_pages"])
      expect(isAgentWebTool(name)).toBe(false);
  });
  it("detects read_web_page in either order of the complete assistant batch", () => {
    const web = { type: "tool-call", toolName: "read_web_page", toolCallId: "web-1" };
    for (const content of [
      [web, mutation],
      [mutation, web],
    ])
      expect(agentBatchContainsWebCall([{ role: "assistant", content }], "write-1")).toBe(true);
  });
  it("fails closed when current tool batch is missing", () => {
    expect(agentBatchContainsWebCall([], "write-1")).toBe(true);
    expect(agentBatchContainsWebCall(undefined, "write-1")).toBe(true);
  });
  it("does not mistake a previously failed web batch for the current write-only batch", () => {
    expect(
      agentBatchContainsWebCall(
        [
          { role: "assistant", content: [{ type: "tool-call", toolName: "read_web_page", toolCallId: "old" }] },
          { role: "tool", content: [{ type: "tool-result", output: { type: "error-text", value: "failed" } }] },
          { role: "assistant", content: [mutation] },
        ],
        "write-1",
      ),
    ).toBe(false);
  });
  it.each([
    { ok: true, result: "page" },
    { type: "json", value: { ok: true, result: "page" } },
  ])("recognizes a successful page read", (result) => {
    expect(isSuccessfulAgentWebResult(result)).toBe(true);
  });
  it.each([
    null,
    { ok: false, result: "robots" },
    { error: "failed", ok: true },
    { type: "error-json", value: { ok: true } },
    { type: "json", value: { ok: false } },
    { results: [] },
  ])("does not make a failed browse sticky", (result) => {
    expect(isSuccessfulAgentWebResult(result)).toBe(false);
  });
});

describe("page-read caps and sources", () => {
  it("caps page reads per reply, lower for an unattended routine run", () => {
    expect(AGENT_WEB_PAGE_MAX_CALLS).toEqual({ chat: 3, routine: 2 });
    expect(agentWebPageCallLimit("chat")).toBe(3);
    expect(agentWebPageCallLimit("routine")).toBe(2);
  });

  it("collects the final https address of each successful page read, never failed reads or other tools", () => {
    const result = (toolName: string, output: unknown) => ({ type: "tool-result", toolName, toolCallId: "x", output });
    expect(
      collectAgentWebSources([
        {
          role: "assistant",
          content: [
            result("read_web_page", { ok: true, result: "page", url: "https://example.com/pricing#plans" }),
            result("read_web_page", { ok: false, result: "robots", url: "https://example.com/blocked" }),
            result("manage_wiki_pages", { ok: true, url: "https://example.com/wiki" }),
          ],
        },
        {
          role: "tool",
          content: [
            result("read_web_page", { type: "json", value: { ok: true, result: "page", url: "https://example.org/" } }),
            result("read_web_page", { ok: true, result: "page", url: "https://user:pw@example.net/" }),
            result("read_web_page", { ok: true, result: "page", url: "http://example.net/" }),
          ],
        },
      ]),
    ).toEqual(["https://example.com/pricing", "https://example.org/"]);
  });

  it("renders a localized Sources footer only from canonical https addresses", () => {
    expect(agentWebSourcesFooter(["https://example.com/a", "https://example.com/a#x"], "Quellen")).toBe(
      "\n\n### Quellen\n- <https://example.com/a>",
    );
    expect(agentWebSourcesFooter(["http://example.com"], "Quellen")).toBe("");
  });
});
