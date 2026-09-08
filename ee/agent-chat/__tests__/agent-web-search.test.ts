import { describe, expect, it } from "vitest";

import {
  AGENT_WEB_SEARCH_TOOL_NAME,
  agentWebSourcesFooter,
  collectAgentWebSources,
  getAgentWebSearchTool,
} from "../agent-web-search";

describe("native Agent web search", () => {
  it("preserves the provider-native tool and restricts optional setup turns by domain", () => {
    expect(getAgentWebSearchTool()).toMatchObject({
      type: "provider",
      isProviderExecuted: true,
      id: "openai.web_search",
      args: { externalWebAccess: true, searchContextSize: "low" },
    });
    expect(getAgentWebSearchTool({ allowedDomains: ["example.com"] })).toMatchObject({
      type: "provider",
      isProviderExecuted: true,
      id: "openai.web_search",
      args: {
        externalWebAccess: true,
        searchContextSize: "low",
        filters: { allowedDomains: ["example.com"] },
      },
    });
  });

  it("collects URL citations and web-search result sources from provider messages", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-result",
            toolName: AGENT_WEB_SEARCH_TOOL_NAME,
            output: {
              type: "json",
              value: {
                sources: [
                  { type: "url", url: "https://example.com/a#section" },
                  { type: "url", url: "https://example.com/b" },
                  { type: "other", url: "https://example.com/ignored" },
                ],
              },
            },
          },
          { type: "source", sourceType: "url", url: "https://example.com/a" },
          { type: "source", sourceType: "url", url: "https://example.com/c?ref=answer#citation" },
        ],
      },
    ];

    expect(collectAgentWebSources(messages)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c?ref=answer",
    ]);
  });

  it("ignores unsafe, failed, unrelated, credentialed, and oversized sources", () => {
    const messages = [
      {
        content: [
          {
            type: "tool-result",
            toolName: "different_tool",
            output: { type: "json", value: { sources: [{ type: "url", url: "https://example.com/unrelated" }] } },
          },
          {
            type: "tool-result",
            toolName: AGENT_WEB_SEARCH_TOOL_NAME,
            output: { type: "error-json", value: { sources: [{ type: "url", url: "https://example.com/error" }] } },
          },
          { type: "source", sourceType: "url", url: "http://example.com/plaintext" },
          { type: "source", sourceType: "url", url: "https://user:secret@example.com/private" },
          { type: "source", sourceType: "url", url: `https://example.com/${"x".repeat(1_001)}` },
          { type: "source", sourceType: "document", url: "https://example.com/document" },
        ],
      },
    ];

    expect(collectAgentWebSources(messages)).toEqual([]);
  });

  it("drops source URLs that the existing visible-output safety boundary would rewrite", () => {
    expect(
      collectAgentWebSources([
        {
          content: [
            {
              type: "source",
              sourceType: "url",
              url: "https://example.com/00000000-0000-4000-8000-000000000001",
            },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("caps a deterministic Markdown footer at eight deduplicated HTTPS links", () => {
    const sources = [
      "https://example.com/a#one",
      "https://example.com/a#two",
      ...Array.from({ length: 10 }, (_, index) => `https://example.com/${index}`),
      "http://example.com/no",
    ];
    const footer = agentWebSourcesFooter(sources);

    expect(footer).toBe(
      "\n\n### Sources\n" +
        ["https://example.com/a", ...Array.from({ length: 7 }, (_, index) => `https://example.com/${index}`)]
          .map((url) => `- <${url}>`)
          .join("\n"),
    );
    expect(footer.match(/^- </gm)).toHaveLength(8);
    expect(agentWebSourcesFooter(["http://example.com"])).toBe("");
  });
});
