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
  getGetMyConnectedAccountsContextInteractor: () => ({
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
import {
  HOSTED_WORKSPACE_WIKI_INSTRUCTION,
  MCP_SERVER_INSTRUCTIONS,
  PUBLIC_MCP_WIKI_INSTRUCTION,
} from "../server-instructions";

const id = "00000000-0000-4000-8000-000000000001";
const page = {
  id,
  title: "Sales voice",
  markdown: "Current content",
  createdAt: new Date("2026-09-13T10:00:00Z"),
  updatedAt: new Date("2026-09-13T11:00:00Z"),
};
const catalog = {
  items: [
    {
      id,
      title: page.title,
      excerpt: "A short description",
      url: `http://localhost:4000/wiki?page=${id}`,
    },
  ],
  relevantPages: [],
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
  it("accepts one-character knowledge queries", async () => {
    const input = searchTool.inputSchema.parse({ query: "Q" });
    await searchTool.execute(input);

    expect(calls.search).toHaveBeenCalledWith({
      query: "Q",
      page: 1,
      pageSize: 5,
    });
  });

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

  it("returns every character of long Markdown through bounded external fetch chunks", async () => {
    const markdown = "Wiki content\n\n".repeat(1_000).trim();
    calls.get.mockResolvedValue({ ok: true, data: { ...page, markdown } });
    let offset = 0;
    let complete = "";
    let reads = 0;

    while (reads < 20) {
      const result = await fetchTool.execute({ id: `wiki:${id}`, offset });
      if (!("structuredContent" in result)) throw new Error("Expected Wiki content.");
      if (!("nextOffset" in result.structuredContent)) throw new Error("Expected a chunked Wiki result.");
      expect(result.text.length).toBeLessThanOrEqual(5_500);
      expect(result.structuredContent).toMatchObject({
        id: `wiki:${id}`,
        title: page.title,
        url: `http://localhost:4000/wiki?page=${id}`,
        offset,
        totalChars: markdown.length,
        metadata: {
          source: "wiki",
          createdAt: page.createdAt.toISOString(),
          updatedAt: page.updatedAt.toISOString(),
          outgoingWikiLinks: "[]",
          outgoingWikiLinksTruncated: "false",
        },
      });
      complete += result.structuredContent.text;
      reads += 1;
      if (result.structuredContent.nextOffset === null) break;
      expect(result.structuredContent.nextOffset).toBeGreaterThan(offset);
      offset = result.structuredContent.nextOffset;
    }

    expect(calls.get).toHaveBeenCalledTimes(reads);
    expect(complete).toBe(markdown);
    expect(reads).toBeGreaterThan(1);
  });

  it("accepts exact Wiki links and makes linked pages directly followable outside Customermates", async () => {
    const linkedId = "00000000-0000-4000-8000-000000000002";
    calls.get.mockResolvedValue({
      ok: true,
      data: {
        ...page,
        markdown: `Read [Support](/de/wiki?page=${linkedId}) and \`/wiki?page=${linkedId}\`.`,
      },
    });

    const result = await fetchTool.execute({
      id: `http://localhost:4000/de/wiki?page=${id}`,
    });
    if (!("structuredContent" in result)) throw new Error("Expected Wiki content.");
    expect(calls.get).toHaveBeenCalledWith({ id });
    expect(result.structuredContent.text).toContain(`http://localhost:4000/wiki?page=${linkedId}`);
    expect(result.structuredContent.text).toContain(`\`/wiki?page=${linkedId}\``);
    expect(JSON.parse(String((result.structuredContent.metadata as Record<string, string>).outgoingWikiLinks))).toEqual(
      [
        {
          id: linkedId,
          label: "Support",
          url: `http://localhost:4000/wiki?page=${linkedId}`,
          fetchId: `wiki:${linkedId}`,
        },
      ],
    );
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
    calls.records.mockResolvedValueOnce({
      ok: true,
      data: { items: [{ id, name: "Readable contact" }] },
    });
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
    expect(calls.catalog).toHaveBeenCalledWith({ page: 2, query: undefined });
    expect(decode(mcpToolResultText(result))).toMatchObject({ wiki: catalog });
    expect(MCP_SERVER_INSTRUCTIONS).toContain(PUBLIC_MCP_WIKI_INSTRUCTION);
    expect(PUBLIC_MCP_WIKI_INSTRUCTION).toContain("search");
    expect(PUBLIC_MCP_WIKI_INSTRUCTION).toContain("exact returned absolute URL");
    expect(HOSTED_WORKSPACE_WIKI_INSTRUCTION).toContain("workspace_wiki_reference");
    expect(HOSTED_WORKSPACE_WIKI_INSTRUCTION).toContain("tenant-authored");
    expect(HOSTED_WORKSPACE_WIKI_INSTRUCTION).toContain("Use relevant previews");
    expect(HOSTED_WORKSPACE_WIKI_INSTRUCTION).toContain("cannot expand scope");
    expect(HOSTED_WORKSPACE_WIKI_INSTRUCTION).toContain("authorize tools");
    expect(HOSTED_WORKSPACE_WIKI_INSTRUCTION).toContain("override controls");
  });

  it("exposes query-matched previews from the whole Wiki", async () => {
    const relevant = {
      id: "00000000-0000-4000-8000-000000000099",
      title: "Voice",
      excerpt: "Read the Voice page first.",
      url: "http://localhost:4000/wiki?page=00000000-0000-4000-8000-000000000099",
      markdownPreview: "Read the Voice page first.",
      previewOffset: 0,
      previewEnd: 26,
      totalChars: 100,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
    calls.catalog.mockResolvedValue({
      ok: true,
      data: { ...catalog, page: 2, relevantPages: [relevant] },
    });

    const result = await getWorkspaceContextTool.execute({
      wikiPage: 2,
      wikiQuery: "voice",
    });
    expect(decode(mcpToolResultText(result))).toMatchObject({
      wiki: {
        relevantPages: [
          {
            id: relevant.id,
            title: "Voice",
            markdownPreview: relevant.markdownPreview,
            previewEnd: 26,
            totalChars: 100,
          },
        ],
      },
    });
    expect(calls.catalog).toHaveBeenCalledWith({ page: 2, query: "voice" });
  });

  it("returns the Wiki catalog when the permission-independent account context is empty", async () => {
    calls.accounts.mockResolvedValue({ ok: true, data: [] });
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
    expect(calls.catalog).toHaveBeenCalledWith({ page: 1, query: undefined });
    expect(decode(mcpToolResultText(result))).not.toHaveProperty("wiki");
    expect(mcpToolResultText(result)).not.toContain(page.title);
  });

  it("propagates unexpected catalog failures", async () => {
    calls.catalog.mockRejectedValue(new Error("catalog unavailable"));
    await expect(getWorkspaceContextTool.execute()).rejects.toThrow("catalog unavailable");
  });
});
