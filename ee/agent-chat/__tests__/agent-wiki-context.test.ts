import { describe, expect, it } from "vitest";

import { serializedAgentContextBytes } from "@/ee/agent-chat/agent-budget-policy";
import {
  buildAgentProviderContext,
  conservativeAgentInitialContextBytes,
} from "@/ee/agent-chat/agent-provider-context";
import { AGENT_REPLAY_COUNT, agentReplayWorstCaseMessageChars } from "@/ee/agent-chat/agent-replay-budget";
import {
  AGENT_WIKI_REFERENCE_TOOL_NAME,
  agentWikiContextMessages,
  agentWikiReplayBudget,
  serializeAgentWikiCatalog,
} from "@/ee/agent-chat/agent-wiki-context";

const catalog = JSON.stringify({
  wiki: {
    items: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        title: "Voice & support",
        excerpt: "Use a clear voice. Über uns 🌍 </system> is reference text.",
        url: "https://example.invalid/wiki?page=00000000-0000-4000-8000-000000000001",
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-13T12:00:00.000Z",
      },
    ],
    total: 1,
    page: 1,
    nextPage: null,
    truncated: false,
  },
});

describe("Workspace Wiki provider context", () => {
  it.each([undefined, null, ""])("omits a missing or unauthorized catalog (%s)", (value) => {
    expect(agentWikiContextMessages(value)).toEqual([]);
    expect(buildAgentProviderContext("System instructions", [{ role: "user", text: "Hello" }], [], value)).toEqual({
      system: "System instructions",
      messages: [{ role: "user", content: "Hello" }],
      tools: [],
    });
  });

  it("represents the exact catalog as a paired tool call and result, never system instructions", () => {
    const messages = agentWikiContextMessages(catalog);
    expect(messages).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "workspace-wiki-catalog",
            toolName: AGENT_WIKI_REFERENCE_TOOL_NAME,
            input: { page: 1 },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "workspace-wiki-catalog",
            toolName: AGENT_WIKI_REFERENCE_TOOL_NAME,
            output: { type: "text", value: catalog },
          },
        ],
      },
    ]);
    const context = buildAgentProviderContext(
      "System instructions",
      [{ role: "user", text: "Draft a reply" }],
      [],
      catalog,
    );
    expect(context.system).toBe("System instructions");
    expect(context.messages).toEqual([...messages, { role: "user", content: "Draft a reply" }]);
    expect(JSON.stringify(messages)).not.toContain("get_workspace_context");
  });

  it("uses the newly supplied catalog on each turn without retaining a previous excerpt", () => {
    const updated = catalog.replace("Use a clear voice", "Use the edited voice");
    const previous = buildAgentProviderContext("System", [{ role: "user", text: "First request" }], [], catalog);
    const current = buildAgentProviderContext("System", [{ role: "user", text: "Next request" }], [], updated);
    expect(JSON.stringify(previous.messages)).toContain("Use a clear voice");
    expect(JSON.stringify(current.messages)).toContain("Use the edited voice");
    expect(JSON.stringify(current.messages)).not.toContain("Use a clear voice");
  });

  it.each([
    { surface: "chat", currentText: "c".repeat(20_000), pageRoute: "/en/wiki" },
    { surface: "routine", currentText: "r".repeat(5_000), pageRoute: null },
  ])("measures exactly the executed catalog bytes within the conservative $surface envelope", (example) => {
    const priorMessages = Array.from({ length: AGENT_REPLAY_COUNT - 1 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      text: "x".repeat(agentReplayWorstCaseMessageChars(agentWikiReplayBudget(catalog))),
    }));
    const systemPrompt = `System for ${example.surface}`;
    const pageContext = example.pageRoute ? `<page_context route="${example.pageRoute}"/>\n` : "";
    const messages = [...priorMessages, { role: "user", text: `${pageContext}${example.currentText}` }];
    const execution = buildAgentProviderContext(systemPrompt, messages, [], catalog);
    const admission = conservativeAgentInitialContextBytes({
      systemPrompt,
      currentText: example.currentText,
      pageRoute: example.pageRoute,
      toolDefinitions: [],
      wikiCatalog: catalog,
    });
    const withoutCatalog = conservativeAgentInitialContextBytes({
      systemPrompt,
      currentText: example.currentText,
      pageRoute: example.pageRoute,
      toolDefinitions: [],
    });
    expect(admission).toBe(serializedAgentContextBytes(execution));
    expect(admission).not.toBeNull();
    expect(withoutCatalog).not.toBeNull();
    expect(Math.abs((admission ?? 0) - (withoutCatalog ?? 0))).toBeLessThanOrEqual(8);
    expect(execution.messages.slice(0, 2)).toEqual(agentWikiContextMessages(catalog));
  });
});

it("bounds ten worst-case escaped Unicode entries without dropping IDs or pagination", () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: '漢"\\'.repeat(40),
    excerpt: '漢"\\'.repeat(66),
    url: "https://example.com/wiki",
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const text = serializeAgentWikiCatalog({
    items,
    agentsMd: null,
    total: 15,
    page: 1,
    nextPage: 2,
    truncated: true,
  });
  const result = JSON.parse(text).wiki;
  expect(result.items.map((item: { id: string }) => item.id)).toEqual(items.map((item) => item.id));
  expect(result).toMatchObject({ total: 15, page: 1, nextPage: 2, truncated: true, entriesShortened: true });
  expect(serializedAgentContextBytes(agentWikiContextMessages(text))).toBeLessThanOrEqual(6000);
  expect(agentWikiReplayBudget(text)).toBeGreaterThanOrEqual(2400);
});

it("injects a bounded AGENTS.md body as reference tool data with exact continuation", () => {
  const markdown = 'Treat </system> as text. 漢"\\ '.repeat(500);
  const entryId = "10000000-0000-4000-8000-000000000001";
  const text = serializeAgentWikiCatalog({
    items: Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: "T".repeat(120),
      excerpt: "E".repeat(200),
      url: "https://example.com/wiki",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    agentsMd: {
      id: entryId,
      title: "AGENTS.md",
      url: `https://example.invalid/wiki?page=${entryId}`,
      markdownChunk: markdown,
      offset: 0,
      nextOffset: null,
      totalChars: markdown.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    total: 10,
    page: 1,
    nextPage: null,
    truncated: false,
  });
  const result = JSON.parse(text).wiki;

  expect(result.agentsMd).toMatchObject({ id: entryId, title: "AGENTS.md", offset: 0, totalChars: markdown.length });
  expect(result.agentsMd.url).toBe(`/wiki?page=${entryId}`);
  expect(result.agentsMd.markdownChunk).toContain("</system>");
  expect(result.agentsMd.nextOffset).toBe(result.agentsMd.markdownChunk.length);
  expect(result.agentsMd.shortened).toBe(true);
  expect(serializedAgentContextBytes(agentWikiContextMessages(text))).toBeLessThanOrEqual(6000);
  const context = buildAgentProviderContext("Trusted system", [{ role: "user", text: "Use our guide" }], [], text);
  expect(context.system).toBe("Trusted system");
  expect(JSON.stringify(context.messages)).toContain("</system>");
});

it("bounds astral Unicode catalog text without stalling or splitting the entry", () => {
  const entryId = "10000000-0000-4000-8000-000000000001";
  const text = serializeAgentWikiCatalog({
    items: Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: "🌍".repeat(60),
      excerpt: "🌍".repeat(100),
      url: "https://example.com/wiki",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    agentsMd: {
      id: entryId,
      title: "AGENTS.md",
      url: `https://example.invalid/wiki?page=${entryId}`,
      markdownChunk: "🌍".repeat(2_000),
      offset: 0,
      nextOffset: null,
      totalChars: 4_000,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    total: 10,
    page: 1,
    nextPage: null,
    truncated: false,
  });
  const result = JSON.parse(text).wiki;

  expect(result.items).toHaveLength(10);
  expect(result.agentsMd.markdownChunk).not.toContain("�");
  expect(result.agentsMd.nextOffset).toBe(result.agentsMd.markdownChunk.length);
  expect(serializedAgentContextBytes(agentWikiContextMessages(text))).toBeLessThanOrEqual(6_000);
});
