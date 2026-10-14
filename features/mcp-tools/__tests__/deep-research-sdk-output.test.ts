import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchWiki = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@/core/di", () => ({
  getSearchExternalizedWikiPagesInteractor: () => ({ invoke: searchWiki }),
  getSearchRecordsInteractor: () => ({ invoke: () => Promise.resolve({ ok: true, data: { results: [] } }) }),
}));
vi.mock("../docs.mcp-tools", () => ({ searchDocsHits: () => Promise.resolve([]) }));

import { searchTool } from "../deep-research.mcp-tools";
import { executeMcpTool } from "../mcp-tool";

const PAGE_ID = "36000000-0000-4000-8000-000000000001";

beforeEach(() => vi.clearAllMocks());

describe("unified search MCP SDK output contract", () => {
  it.each([
    ["Operating Guide", "guide", "Read before changing workspace rules"],
    ["Sales Process", "procedure", "Use when qualifying a lead"],
    ["Product Fact Sheet", "knowledge", null],
  ] as const)("validates a %s result through the MCP SDK client", async (title, kind, whenToUse) => {
    searchWiki.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: PAGE_ID,
            title,
            kind,
            whenToUse,
            snippet: `Matched **${title}**`,
            section: title,
            offset: 0,
          },
        ],
      },
    });

    const server = new McpServer({ name: "unified-search-output-test", version: "1.0.0" });
    server.registerTool(
      searchTool.name,
      {
        title: searchTool.title,
        description: searchTool.description,
        inputSchema: searchTool.inputSchema,
        outputSchema: searchTool.outputSchema,
      },
      async ({ query }) => {
        const result = await executeMcpTool(searchTool, [{ query }]);
        if (!result.ok) return { isError: true, content: [{ type: "text" as const, text: result.result }] };
        return {
          content: [{ type: "text" as const, text: result.result }],
          structuredContent: result.structuredContent,
        };
      },
    );
    const client = new Client({ name: "unified-search-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      await client.listTools();
      const result = await client.callTool({ name: searchTool.name, arguments: { query: title } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        results: [{ title, ...(kind === "knowledge" ? {} : { kind, whenToUse }) }],
      });
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
