import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@toon-format/toon";

import { ForbiddenError } from "@/core/errors/app-errors";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const calls = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  search: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
  getLocale: () => Promise.resolve("en"),
}));
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getCreateWikiPagesInteractor: () => ({ invoke: calls.create }),
  getDeleteWikiPageInteractor: () => ({ invoke: calls.delete }),
  getGetWikiPageInteractor: () => ({ invoke: calls.get }),
  getGetWikiPagesInteractor: () => ({ invoke: calls.list }),
  getSearchWikiPagesInteractor: () => ({ invoke: calls.search }),
  getUpdateWikiPageInteractor: () => ({ invoke: calls.update }),
}));

import { ALL_MCP_TOOLS, MCP_TOOL_GROUPS } from "../tool-registry";
import { manageWikiPagesTool, WikiHomepageSetupCreateSchema } from "../wiki.mcp-tools";
import { executeMcpTool, mcpToolResultText } from "../mcp-tool";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const CREATED_AT = new Date("2026-09-08T09:00:00.000Z");
const UPDATED_AT = new Date("2026-09-08T10:00:00.000Z");

function page(markdown = "Body") {
  return {
    id: PAGE_ID,
    title: "Company Overview",
    markdown,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function isLowSurrogate(code: number) {
  return code >= 0xdc00 && code <= 0xdfff;
}

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff;
}

async function run(input: Record<string, unknown>) {
  const parsed = manageWikiPagesTool.inputSchema.parse(input);
  return manageWikiPagesTool.execute(parsed);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("manage_wiki_pages registry", () => {
  it("is one shared public MCP tool", () => {
    expect(MCP_TOOL_GROUPS.wiki).toEqual([manageWikiPagesTool]);
    expect(ALL_MCP_TOOLS.filter(({ name }) => name === "manage_wiki_pages")).toEqual([manageWikiPagesTool]);
  });

  it("exposes only the two setup capabilities during homepage setup", () => {
    const validPages = Array.from({ length: 5 }, (_, index) => ({ title: `Page ${index + 1}`, markdown: "Body" }));

    expect(
      WikiHomepageSetupCreateSchema.safeParse({ action: "create", pages: validPages, requireEmpty: true }).success,
    ).toBe(true);
    for (const invalid of [
      { action: "list" },
      { action: "create", pages: validPages.slice(0, 4), requireEmpty: true },
      { action: "create", pages: validPages, requireEmpty: false },
      { action: "update", pages: validPages, requireEmpty: true },
    ])
      expect(WikiHomepageSetupCreateSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("manage_wiki_pages reads", () => {
  it("lists summaries in the interactor's page without exposing Markdown", async () => {
    calls.list.mockResolvedValue({
      ok: true,
      data: {
        items: [{ id: PAGE_ID, title: "Company Overview", createdAt: CREATED_AT, updatedAt: UPDATED_AT }],
        total: 1,
        page: 2,
        pageSize: 5,
      },
    });

    const result = await run({ action: "list", page: 2, pageSize: 5 });
    const output = decode(mcpToolResultText(result));

    expect(calls.list).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
    expect(output).toEqual({
      items: [
        {
          id: PAGE_ID,
          title: "Company Overview",
          createdAt: CREATED_AT.toISOString(),
          updatedAt: UPDATED_AT.toISOString(),
        },
      ],
      total: 1,
      page: 2,
      pageSize: 5,
    });
    expect(JSON.stringify(output)).not.toContain("markdown");
  });

  it("searches tenant content with a short snippet and pagination", async () => {
    calls.search.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: PAGE_ID,
            title: "Company Overview",
            snippet: "A useful match",
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 5,
      },
    });

    const result = await run({ action: "search", query: "useful" });

    expect(calls.search).toHaveBeenCalledWith({ query: "useful", page: 1, pageSize: 5 });
    expect(decode(mcpToolResultText(result))).toMatchObject({
      items: [{ id: PAGE_ID, snippet: "A useful match" }],
      total: 1,
    });
  });

  it("keeps a maximum-width search page below the agent result limit without truncation", async () => {
    const title = '"|,😀'.repeat(40).slice(0, 120);
    const snippet = '"|,😀'.repeat(81).slice(0, 242);
    calls.search.mockResolvedValue({
      ok: true,
      data: {
        items: Array.from({ length: 5 }, (_, index) => ({
          id: `00000000-0000-4000-8000-00000000000${index + 1}`,
          title,
          snippet,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        })),
        total: 23,
        page: 1,
        pageSize: 5,
      },
    });

    const text = mcpToolResultText(await run({ action: "search", query: "match" }));
    const output = decode(text) as { items: unknown[]; total: number; page: number; pageSize: number };

    expect(text.length).toBeLessThan(6_000);
    expect(output).toMatchObject({ total: 23, page: 1, pageSize: 5 });
    expect(output.items).toHaveLength(5);
    expect(manageWikiPagesTool.inputSchema.safeParse({ action: "search", query: "match", pageSize: 10 }).success).toBe(
      false,
    );
  });

  it("returns long Unicode Markdown in bounded, contiguous chunks", async () => {
    const markdown = "😀".repeat(4_000);
    calls.get.mockResolvedValue({ ok: true, data: page(markdown) });

    let offset = 0;
    let reconstructed = "";
    for (let chunkIndex = 0; chunkIndex < 10; chunkIndex += 1) {
      const result = await run({ action: "get", id: PAGE_ID, offset });
      const text = mcpToolResultText(result);
      const output = decode(text) as {
        markdownChunk: string;
        offset: number;
        nextOffset: number | null;
        totalChars: number;
      };

      expect(text.length).toBeLessThanOrEqual(5_500);
      expect(output.totalChars).toBe(markdown.length);
      expect(output.offset).toBe(offset);
      expect(isLowSurrogate(output.markdownChunk.charCodeAt(0))).toBe(false);
      expect(isHighSurrogate(output.markdownChunk.charCodeAt(output.markdownChunk.length - 1))).toBe(false);
      reconstructed += output.markdownChunk;

      if (output.nextOffset === null) break;
      expect(output.nextOffset).toBeGreaterThan(offset);
      offset = output.nextOffset;
    }

    expect(reconstructed).toBe(markdown);
  });

  it("normalizes a mid-code-point offset and handles offsets beyond the document", async () => {
    const markdown = "A😀B";
    calls.get.mockResolvedValue({ ok: true, data: page(markdown) });

    const middle = decode(mcpToolResultText(await run({ action: "get", id: PAGE_ID, offset: 2 }))) as {
      markdownChunk: string;
      offset: number;
      nextOffset: number | null;
    };
    expect(middle).toMatchObject({ markdownChunk: "😀B", offset: 1, nextOffset: null });

    const beyond = decode(mcpToolResultText(await run({ action: "get", id: PAGE_ID, offset: 10_000 }))) as {
      markdownChunk: string;
      offset: number;
      nextOffset: number | null;
      totalChars: number;
    };
    expect(beyond).toEqual(
      expect.objectContaining({
        markdownChunk: "",
        offset: markdown.length,
        nextOffset: null,
        totalChars: markdown.length,
      }),
    );
  });
});

describe("manage_wiki_pages writes", () => {
  it("delegates one atomic empty-only five-page create", async () => {
    const pages = Array.from({ length: 5 }, (_, index) => ({ title: `Page ${index + 1}`, markdown: `Body ${index}` }));
    calls.create.mockResolvedValue({
      ok: true,
      data: pages.map((value, index) => ({
        ...page(value.markdown),
        id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        title: value.title,
      })),
    });

    const result = await run({ action: "create", pages, requireEmpty: true });

    expect(calls.create).toHaveBeenCalledWith({ pages, requireEmpty: true });
    expect((decode(mcpToolResultText(result)) as { items: unknown[] }).items).toHaveLength(5);
  });

  it("passes the optimistic-concurrency token to update and delete", async () => {
    calls.update.mockResolvedValue({ ok: true, data: page("Updated") });
    calls.delete.mockResolvedValue({ ok: true, data: page() });

    await run({
      action: "update",
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT.toISOString(),
      markdown: "Updated",
    });
    const deleted = await run({
      action: "delete",
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT.toISOString(),
    });

    expect(calls.update).toHaveBeenCalledWith({
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT,
      markdown: "Updated",
    });
    expect(calls.delete).toHaveBeenCalledWith({ id: PAGE_ID, expectedUpdatedAt: UPDATED_AT });
    expect(decode(mcpToolResultText(deleted))).toEqual({ deleted: true, id: PAGE_ID });
  });

  it.each([
    [{ action: "update", id: PAGE_ID, expectedUpdatedAt: UPDATED_AT.toISOString() }, "update"],
    [{ action: "delete", id: PAGE_ID }, "delete"],
  ] as const)("rejects incomplete %s input before invoking an interactor", async (input, action) => {
    const result = await run(input as unknown as Record<string, unknown>);

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(calls[action]).not.toHaveBeenCalled();
  });

  it("rejects an empty create batch in the public tool schema", () => {
    expect(manageWikiPagesTool.inputSchema.safeParse({ action: "create", pages: [] }).success).toBe(false);
    expect(calls.create).not.toHaveBeenCalled();
  });
});

describe("manage_wiki_pages permissions", () => {
  it.each([
    ["list", { action: "list" }],
    ["create", { action: "create", pages: [{ title: "Company", markdown: "Body" }] }],
  ] as const)("returns a stable authorization failure when %s is denied", async (call, input) => {
    calls[call].mockRejectedValue(new ForbiddenError());

    const result = await executeMcpTool(manageWikiPagesTool, [manageWikiPagesTool.inputSchema.parse(input)]);

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "authorization" },
    });
    expect(calls[call]).toHaveBeenCalledOnce();
  });
});
