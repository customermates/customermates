import { describe, expect, it } from "vitest";

import {
  AGENT_WEB_SEARCH_DEFAULT_CONTENT_CHARS,
  AGENT_WEB_SEARCH_DEFAULT_RESULTS,
  AGENT_WEB_SEARCH_MAX_CALLS,
  AGENT_WEB_SEARCH_TOOL_NAME,
  AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS,
  agentWebSearchCallLimit,
  agentWebSearchCallsInStep,
  agentWebSourcesFooter,
  collectAgentWebSources,
  getAgentWebSearchTool,
} from "../agent-web-search";

describe("native Agent web search", () => {
  it("caps paid searches per turn, lower for an unattended routine run", () => {
    expect(AGENT_WEB_SEARCH_MAX_CALLS).toEqual({ chat: 3, routine: 2 });
    expect(agentWebSearchCallLimit("chat")).toBe(3);
    expect(agentWebSearchCallLimit("routine")).toBe(2);
  });

  it("prices one search at its documented worst case", () => {
    expect(AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS).toBe(1_200_000);
  });

  it("counts every provider-executed search inside one step, as billed or as called", () => {
    const search = (toolCallId: string) => ({
      type: "tool-call",
      toolName: AGENT_WEB_SEARCH_TOOL_NAME,
      toolCallId,
      input: { query: toolCallId },
      providerExecuted: true,
    });
    const text = { type: "text", text: "Answer." };
    const billed = (count: unknown) => ({
      gateway: { gatewayToolCalls: { exa_search: count } },
    });

    expect(
      agentWebSearchCallsInStep({
        content: [search("web-1"), text, search("web-2"), text, text],
      }),
    ).toBe(2);
    expect(
      agentWebSearchCallsInStep({
        content: [search("web-1")],
        providerMetadata: billed(2),
      }),
    ).toBe(2);
    expect(
      agentWebSearchCallsInStep({
        content: [search("web-1"), search("web-2")],
        providerMetadata: billed(1),
      }),
    ).toBe(2);
    expect(
      agentWebSearchCallsInStep({
        content: [{ ...search("web-1"), providerExecuted: false }],
      }),
    ).toBe(0);
    expect(
      agentWebSearchCallsInStep({
        content: [{ ...search("x"), toolName: "list_users" }],
        providerMetadata: billed(0),
      }),
    ).toBe(0);
    for (const invalid of [-1, 1.5, "2", null]) {
      expect(
        agentWebSearchCallsInStep({
          content: [],
          providerMetadata: billed(invalid),
        }),
      ).toBe(0);
    }
  });

  it("preserves the provider-native tool and restricts optional setup turns by domain", () => {
    expect(getAgentWebSearchTool()).toMatchObject({
      type: "provider",
      isProviderExecuted: true,
      id: "gateway.exa_search",
      args: {
        type: "auto",
        numResults: 3,
        contents: {
          text: { maxCharacters: 1000, verbosity: "compact", includeHtmlTags: false },
          highlights: false,
          subpages: 0,
          extras: { links: 0, imageLinks: 0 },
        },
      },
    });
    expect(getAgentWebSearchTool({ allowedDomains: ["example.com"] })).toMatchObject({
      type: "provider",
      isProviderExecuted: true,
      id: "gateway.exa_search",
      args: {
        type: "auto",
        numResults: 3,
        includeDomains: ["example.com"],
        contents: {
          text: { maxCharacters: 1000, verbosity: "compact", includeHtmlTags: false },
          highlights: false,
          subpages: 0,
          extras: { links: 0, imageLinks: 0 },
        },
      },
    });
  });

  it("pins every billed Exa option in the configuration so the model's input cannot raise it", () => {
    const { args } = getAgentWebSearchTool();
    const pinned = args as {
      numResults: number;
      contents: {
        text: { maxCharacters: number; includeHtmlTags: boolean };
        highlights: boolean;
        subpages: number;
        extras: { links: number; imageLinks: number };
        subpageTarget?: unknown;
      };
    };

    expect(pinned.numResults).toBe(AGENT_WEB_SEARCH_DEFAULT_RESULTS);
    expect(pinned.contents.text.maxCharacters).toBe(AGENT_WEB_SEARCH_DEFAULT_CONTENT_CHARS);
    expect(pinned.contents.text.includeHtmlTags).toBe(false);
    expect(pinned.contents.highlights).toBe(false);
    expect(pinned.contents.subpages).toBe(0);
    expect(pinned.contents.subpageTarget).toBeUndefined();
    expect(pinned.contents.extras).toEqual({ links: 0, imageLinks: 0 });
    expect(Object.keys(args).sort()).toEqual(["contents", "numResults", "type"]);
    expect(Object.keys(pinned.contents).sort()).toEqual(["extras", "highlights", "subpages", "text"]);
  });

  it("collects canonical Exa result URLs", () => {
    expect(
      collectAgentWebSources([
        {
          content: [
            {
              type: "tool-result",
              toolName: AGENT_WEB_SEARCH_TOOL_NAME,
              output: {
                requestId: "request-1",
                results: [
                  {
                    id: "one",
                    title: "One",
                    url: "https://example.com/one#fragment",
                  },
                  { id: "two", title: "Two", url: "https://example.com/two" },
                ],
              },
            },
          ],
        },
      ]),
    ).toEqual(["https://example.com/one", "https://example.com/two"]);
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
          {
            type: "source",
            sourceType: "url",
            url: "https://example.com/c?ref=answer#citation",
          },
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
            output: {
              type: "json",
              value: {
                sources: [{ type: "url", url: "https://example.com/unrelated" }],
              },
            },
          },
          {
            type: "tool-result",
            toolName: AGENT_WEB_SEARCH_TOOL_NAME,
            output: {
              type: "error-json",
              value: {
                sources: [{ type: "url", url: "https://example.com/error" }],
              },
            },
          },
          {
            type: "source",
            sourceType: "url",
            url: "http://example.com/plaintext",
          },
          {
            type: "source",
            sourceType: "url",
            url: "https://user:secret@example.com/private",
          },
          {
            type: "source",
            sourceType: "url",
            url: `https://example.com/${"x".repeat(1_001)}`,
          },
          {
            type: "source",
            sourceType: "document",
            url: "https://example.com/document",
          },
        ],
      },
    ];

    expect(collectAgentWebSources(messages)).toEqual([]);
  });

  it("preserves provider source URLs whose public paths contain UUIDs", () => {
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
    ).toEqual(["https://example.com/00000000-0000-4000-8000-000000000001"]);
  });

  it("caps a deterministic Markdown footer under the localized heading at eight deduplicated HTTPS links", () => {
    const sources = [
      "https://example.com/a#one",
      "https://example.com/a#two",
      ...Array.from({ length: 10 }, (_, index) => `https://example.com/${index}`),
      "http://example.com/no",
    ];
    const footer = agentWebSourcesFooter(sources, "Quellen");

    expect(footer).toBe(
      "\n\n### Quellen\n" +
        ["https://example.com/a", ...Array.from({ length: 7 }, (_, index) => `https://example.com/${index}`)]
          .map((url) => `- <${url}>`)
          .join("\n"),
    );
    expect(footer.match(/^- </gm)).toHaveLength(8);
    expect(agentWebSourcesFooter(["http://example.com"], "Quellen")).toBe("");
  });
});
