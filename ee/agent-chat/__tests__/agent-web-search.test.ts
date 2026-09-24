import { describe, expect, it } from "vitest";

import {
  AGENT_WEB_SEARCH_TOOL_NAME,
  agentWebSourcesFooter,
  collectAgentWebSources,
  getAgentWebSearchTool,
  resolveAgentWebSearchEnabled,
} from "../agent-web-search";

describe("native Agent web search", () => {
  it("allows an explicit local-development E2E without opening a production release path", () => {
    expect(
      resolveAgentWebSearchEnabled({
        nodeEnv: "development",
        localE2eOptIn: "true",
        agentEvalOptIn: "true",
        databaseTestsOptIn: "true",
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/customermates",
        directUrl: "",
        ci: "",
        deploymentConfigured: false,
        libpqRoutingConfigured: false,
      }),
    ).toBe(true);
    for (const options of [
      { nodeEnv: "production" },
      { localE2eOptIn: "false" },
      { agentEvalOptIn: "false" },
      { databaseTestsOptIn: "false" },
      { databaseUrl: "postgresql://database.example.com/db" },
      { databaseUrl: "not-a-url" },
      { databaseUrl: "postgresql://localhost/db?host=database.example.com" },
      { directUrl: "postgresql://database.example.com/db" },
      { directUrl: "postgresql://localhost/db?host=database.example.com" },
      { ci: "true" },
      { ci: "false" },
      { deploymentConfigured: true },
      { libpqRoutingConfigured: true },
    ]) {
      expect(
        resolveAgentWebSearchEnabled({
          nodeEnv: "development",
          localE2eOptIn: "true",
          agentEvalOptIn: "true",
          databaseTestsOptIn: "true",
          databaseUrl: "postgresql://localhost/db",
          ci: "",
          deploymentConfigured: false,
          libpqRoutingConfigured: false,
          ...options,
        }),
      ).toBe(false);
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
          text: { maxCharacters: 1000, verbosity: "compact" },
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
          text: { maxCharacters: 1000, verbosity: "compact" },
        },
      },
    });
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
