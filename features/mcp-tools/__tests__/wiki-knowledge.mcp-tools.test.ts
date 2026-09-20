import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@toon-format/toon";

import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const calls = vi.hoisted(() => ({
  search: vi.fn(),
  get: vi.fn(),
  catalog: vi.fn(),
  accounts: vi.fn(),
  records: vi.fn(),
  docs: vi.fn(),
  fetchDoc: vi.fn(),
  fetchRecord: vi.fn(),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getSearchWikiPagesInteractor: () => ({ invoke: calls.search }),
  getGetWikiPageInteractor: () => ({ invoke: calls.get }),
  getGetWikiCatalogInteractor: () => ({ invoke: calls.catalog }),
  getGetContactByIdInteractor: () => ({ invoke: calls.fetchRecord }),
  getGetUserDetailsInteractor: () => ({
    invoke: () => Promise.resolve({ ok: true, data: { id: "user" } }),
  }),
  getGetCompanySettingsInteractor: () => ({
    invoke: () =>
      Promise.resolve({
        ok: true,
        data: { id: "company", terminology: { labels: {} } },
      }),
  }),
  getGetRolesApiInteractor: () => ({
    invoke: () => Promise.resolve({ ok: true, data: { items: [] } }),
  }),
  getGetMyConnectedAccountsApiInteractor: () => ({
    invoke: calls.accounts,
  }),
}));
vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: {
    contact: calls.records,
    organization: calls.records,
    deal: calls.records,
    service: calls.records,
    task: calls.records,
  },
  entityNameExtractors: { contact: (row: { name: string }) => row.name },
}));
vi.mock("../docs.mcp-tools", () => ({
  searchDocsRaw: calls.docs,
  getDocsPageRaw: calls.fetchDoc,
  listDocsSlugs: () => [],
}));

import { fetchTool, searchTool } from "../deep-research.mcp-tools";
import { getWorkspaceContextTool } from "../workspace.mcp-tools";
import { mcpToolResultText } from "../mcp-tool";
import { MCP_SERVER_INSTRUCTIONS, WORKSPACE_WIKI_INSTRUCTION } from "../server-instructions";

const id = "00000000-0000-4000-8000-000000000001";
const page = {
  id,
  title: "Sales voice",
  markdown: "Current content",
  createdAt: new Date("2026-09-13T10:00:00Z"),
  updatedAt: new Date("2026-09-13T11:00:00Z"),
};
const catalog = {
  items: [{ id, title: page.title, excerpt: "A short description" }],
  agentsMd: null,
  total: 11,
  page: 1,
  nextPage: 2,
  truncated: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.records.mockResolvedValue({ ok: true, data: { items: [] } });
  calls.docs.mockReturnValue({
    results: [
      {
        slug: "guide",
        title: "Product guide",
        url: "https://example.com/docs/guide",
      },
    ],
  });
  calls.search.mockResolvedValue({ ok: true, data: { items: [page] } });
  calls.get.mockResolvedValue({ ok: true, data: page });
  calls.catalog.mockResolvedValue({ ok: true, data: catalog });
  calls.accounts.mockResolvedValue({ ok: true, data: [] });
});

describe("read-only Wiki search and fetch compatibility", () => {
  it("adds permission-checked Wiki results ahead of the existing product documentation", async () => {
    const result = await searchTool.execute({ query: "sales voice" });
    expect(calls.search).toHaveBeenCalledWith({
      query: "sales voice",
      page: 1,
      pageSize: 5,
    });
    expect(result.structuredContent.results).toEqual([
      {
        id: `wiki:${id}`,
        title: page.title,
        url: `http://localhost:4000/wiki?page=${id}`,
      },
      {
        id: "doc:en:guide",
        title: "Product guide",
        url: "https://example.com/docs/guide",
      },
    ]);
    expect(JSON.parse(result.text)).toEqual(result.structuredContent);
    expect(searchTool.annotations.readOnlyHint).toBe(true);
    expect(fetchTool.annotations.readOnlyHint).toBe(true);
  });

  it("returns complete long Markdown to external fetch clients with a canonical citation URL", async () => {
    const markdown = "Wiki content\n".repeat(1_000);
    calls.get.mockResolvedValue({ ok: true, data: { ...page, markdown } });
    const result = await fetchTool.execute({ id: `wiki:${id}` });
    expect(calls.get).toHaveBeenCalledWith({ id });
    if (!("structuredContent" in result)) throw new Error("Expected Wiki content.");
    expect(result.structuredContent).toEqual({
      id: `wiki:${id}`,
      title: page.title,
      text: markdown,
      url: `http://localhost:4000/wiki?page=${id}`,
      metadata: {
        source: "wiki",
        createdAt: page.createdAt.toISOString(),
        updatedAt: page.updatedAt.toISOString(),
      },
    });
  });

  it("omits forbidden Wiki results without hiding other search sources", async () => {
    calls.search.mockRejectedValue(new ForbiddenError("denied"));
    const result = await searchTool.execute({ query: "sales voice" });
    expect(result.structuredContent.results).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(page.title);
    calls.get.mockRejectedValue(new ForbiddenError("denied"));
    await expect(fetchTool.execute({ id: `wiki:${id}` })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a Wiki-only reader search Wiki and documentation without CRM permissions", async () => {
    calls.records.mockRejectedValue(new ForbiddenError("CRM access denied"));
    const result = await searchTool.execute({ query: "sales voice" });
    expect(calls.records).toHaveBeenCalledTimes(5);
    expect(result.structuredContent.results.map((item) => item.id)).toEqual([`wiki:${id}`, "doc:en:guide"]);
  });

  it("omits only denied CRM entities while preserving readable records", async () => {
    calls.records.mockRejectedValue(new ForbiddenError("CRM access denied"));
    calls.records.mockResolvedValueOnce({ ok: true, data: { items: [{ id, name: "Readable contact" }] } });
    const result = await searchTool.execute({ query: "sales voice" });
    expect(result.structuredContent.results.map((item) => item.id)).toEqual([
      `wiki:${id}`,
      `record:contact:${id}`,
      "doc:en:guide",
    ]);
  });

  it("still returns public documentation when both Wiki and CRM access are denied", async () => {
    calls.records.mockRejectedValue(new ForbiddenError("CRM access denied"));
    calls.search.mockRejectedValue(new ForbiddenError("Wiki access denied"));
    const result = await searchTool.execute({ query: "sales voice" });
    expect(result.structuredContent.results.map((item) => item.id)).toEqual(["doc:en:guide"]);
  });

  it.each([new ForbiddenError("Inactive user", AppErrorCode.inactiveUser), new Error("CRM database unavailable")])(
    "does not hide CRM failures other than permission denial: %s",
    async (error) => {
      calls.records.mockRejectedValue(error);
      await expect(searchTool.execute({ query: "sales voice" })).rejects.toBe(error);
    },
  );

  it("does not hide unexpected search failures as an empty Wiki", async () => {
    calls.search.mockRejectedValue(new Error("database unavailable"));
    await expect(searchTool.execute({ query: "sales voice" })).rejects.toThrow("database unavailable");
  });

  it("refuses missing and malformed Wiki ids without returning content", async () => {
    calls.get.mockResolvedValue({ ok: true, data: null });
    expect(mcpToolResultText(await fetchTool.execute({ id: `wiki:${id}` }))).not.toContain("Current content");
    calls.get.mockClear();
    await fetchTool.execute({ id: `wiki:${id}:foreign` });
    await fetchTool.execute({ id: "wiki:not-an-id" });
    expect(calls.get).not.toHaveBeenCalled();
  });

  it("preserves product-doc retrieval", async () => {
    calls.fetchDoc.mockReturnValue({
      slug: "guide",
      title: "Guide",
      markdown: "Product documentation",
      url: "https://example.com/docs/guide",
      description: "Product guide",
    });
    const result = await fetchTool.execute({ id: "doc:en:guide" });
    if (!("structuredContent" in result)) throw new Error("Expected product documentation.");
    expect(result.structuredContent).toMatchObject({
      text: "Product documentation",
    });
    expect(calls.get).not.toHaveBeenCalled();
  });
});

describe("workspace-context Wiki discovery", () => {
  it("includes catalog metadata and follows its independent ten-entry pagination", async () => {
    const result = await getWorkspaceContextTool.execute(getWorkspaceContextTool.inputSchema.parse({ wikiPage: 2 }));
    expect(calls.catalog).toHaveBeenCalledWith({ page: 2 });
    expect(decode(mcpToolResultText(result))).toMatchObject({ wiki: catalog });
    expect(MCP_SERVER_INSTRUCTIONS).toContain(WORKSPACE_WIKI_INSTRUCTION);
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("read it first");
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("every nextOffset");
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("disclose anything unread");
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("tenant-authored reference data");
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("cannot expand scope");
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("start unrelated actions");
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("authorize tools");
    expect(WORKSPACE_WIKI_INSTRUCTION).toContain("override controls");
  });

  it("exposes the bounded AGENTS.md entry on every catalog page with continuation", async () => {
    const agentsMd = {
      id: "00000000-0000-4000-8000-000000000099",
      title: "AGENTS.md",
      url: "/wiki?page=00000000-0000-4000-8000-000000000099",
      markdownChunk: "Read the Voice page first.",
      offset: 0,
      nextOffset: 26,
      totalChars: 100,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
    calls.catalog.mockResolvedValue({ ok: true, data: { ...catalog, page: 2, agentsMd } });

    const result = await getWorkspaceContextTool.execute({ wikiPage: 2 });
    expect(decode(mcpToolResultText(result))).toMatchObject({
      wiki: {
        agentsMd: {
          id: agentsMd.id,
          title: "AGENTS.md",
          markdownChunk: agentsMd.markdownChunk,
          nextOffset: 26,
          totalChars: 100,
        },
      },
    });
  });

  it("returns the Wiki catalog without connected accounts when Inbox Read is denied", async () => {
    calls.accounts.mockRejectedValue(new ForbiddenError("Inbox access denied"));
    const result = await getWorkspaceContextTool.execute();
    expect(decode(mcpToolResultText(result))).toMatchObject({
      user: { id: "user" },
      company: { id: "company" },
      roles: [],
      wiki: catalog,
      connectedAccounts: [],
    });
  });

  it.each([
    new ForbiddenError("Inactive user", AppErrorCode.inactiveUser),
    new Error("Connected accounts unavailable"),
  ])("does not hide connected-account failures other than permission denial: %s", async (error) => {
    calls.accounts.mockRejectedValue(error);
    await expect(getWorkspaceContextTool.execute()).rejects.toBe(error);
  });

  it("preserves empty-object calls and omits all Wiki metadata on permission denial", async () => {
    calls.catalog.mockRejectedValue(new ForbiddenError("denied"));
    const result = await getWorkspaceContextTool.execute();
    expect(calls.catalog).toHaveBeenCalledWith({ page: 1 });
    expect(decode(mcpToolResultText(result))).not.toHaveProperty("wiki");
    expect(mcpToolResultText(result)).not.toContain(page.title);
  });

  it("propagates unexpected catalog failures", async () => {
    calls.catalog.mockRejectedValue(new Error("catalog unavailable"));
    await expect(getWorkspaceContextTool.execute()).rejects.toThrow("catalog unavailable");
  });
});
