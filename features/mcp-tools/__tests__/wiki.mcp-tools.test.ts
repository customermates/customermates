import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@toon-format/toon";

import { ForbiddenError } from "@/core/errors/app-errors";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { WikiMarkdownSchema } from "@/features/wiki/wiki.schema";
import { APP_LOCALES } from "@/i18n/locale-registry";
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
  getSearchWikiKnowledgeInteractor: () => ({ invoke: calls.search }),
  getUpdateWikiPageInteractor: () => ({ invoke: calls.update }),
}));

import { ALL_MCP_TOOLS, MCP_TOOL_GROUPS } from "../tool-registry";
import { manageWikiPagesTool, WIKI_HOMEPAGE_RESERVED_HEADINGS, WikiHomepageSetupCreateSchema } from "../wiki.mcp-tools";
import { createWikiFromWebsiteTool } from "../wiki-website-setup-tool";
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

  it("warns that delete is irreversible and that a changed page restarts chunking", () => {
    expect(manageWikiPagesTool.description).toContain("action delete is IRREVERSIBLE.");
    expect(manageWikiPagesTool.description).toContain(
      "If updatedAt differs from the previous chunk, restart at offset 0.",
    );
  });
});

describe("homepage setup create", () => {
  const PAGE = {
    title: "Company overview",
    sections: [{ heading: "Details", content: "Verified" }],
    sources: ["https://example.com/"],
  };
  const setup = (...pages: Record<string, unknown>[]) => ({ action: "create", requireEmpty: true, pages });
  const accepts = (input: unknown) => WikiHomepageSetupCreateSchema.safeParse(input).success;
  const titled = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ ...PAGE, title: `Area ${index + 1}` }));

  it("accepts one to five evidence-backed pages and nothing else", () => {
    expect(accepts(setup(PAGE))).toBe(true);
    expect(accepts(setup(...titled(5)))).toBe(true);
    expect(accepts(setup({ ...PAGE, gaps: ["Which regions does the team serve?"] }))).toBe(true);
    for (const invalid of [
      { action: "list" },
      setup(),
      setup(...titled(6)),
      setup({ ...PAGE, sections: [] }),
      setup({ ...PAGE, sources: [] }),
      setup({ ...PAGE, sections: [], sources: [], gaps: ["Which products exist?"] }),
      setup({ ...PAGE, title: " " }),
      setup({ sections: PAGE.sections, sources: PAGE.sources }),
      setup(PAGE, { ...PAGE, title: "COMPANY OVERVIEW" }),
      setup({ ...PAGE, sources: Array.from({ length: 5 }, (_, index) => `https://example.com/${index}`) }),
      setup({ ...PAGE, gaps: Array.from({ length: 6 }, (_, index) => `Question ${index}?`) }),
      setup({ ...PAGE, gaps: ["Which [portal](https://example.com/login) applies?"] }),
      setup({ ...PAGE, gaps: ["Two\nlines"] }),
      { ...setup(PAGE), requireEmpty: false },
      { ...setup(PAGE), action: "update" },
    ])
      expect(accepts(invalid)).toBe(false);
  });

  it("normalizes titles, sections, and gaps before storage", () => {
    const parsed = WikiHomepageSetupCreateSchema.parse(
      setup({
        title: "**Company** &mdash; overview",
        sections: [
          {
            heading: "## Useful &mdash; section",
            content: "Verified &mdash; content &#8212; more\n\nSetext label\n---\n\n### Nested label",
          },
        ],
        sources: ["https://example.com/"],
        gaps: ["Which *markets* &mdash; if any?"],
      }),
    );

    expect(parsed.pages[0]).toMatchObject({
      title: "Company - overview",
      sections: [{ heading: "Useful - section", content: "Verified - content - more\n\nSetext label\n\nNested label" }],
      gaps: ["Which markets - if any?"],
    });
    for (const heading of ["Two\nlines", "—".repeat(120)])
      expect(accepts(setup({ ...PAGE, sections: [{ heading, content: "Body" }] }))).toBe(false);
  });

  it("bounds sections and keeps server-owned headings, links, and images out of model input", () => {
    const withSections = (sections: { heading: string; content: string }[]) => setup({ ...PAGE, sections });
    const numbered = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ heading: `Section ${index + 1}`, content: "Content" }));

    expect(accepts(withSections(numbered(5)))).toBe(true);
    expect(accepts(withSections(numbered(6)))).toBe(false);
    for (const content of [" ", "x".repeat(8_001), "[".repeat(8_000)])
      expect(accepts(withSections([{ heading: "Details", content }]))).toBe(false);
    for (const heading of [
      "Sources",
      "Quellen",
      "Fuentes",
      "Points à confirmer",
      "Aspetti da confermare",
      "**Sources**",
      "_Gaps to confirm_",
      "`Sources`",
      "Sources ##",
      "[Linked heading](/wiki?page=00000000-0000-4000-8000-000000000001)",
      String.raw`\[Escaped link\](/wiki?page=00000000-0000-4000-8000-000000000001)`,
    ])
      expect(accepts(withSections([{ heading, content: "Content" }]))).toBe(false);
    for (const content of [
      "[External](https://attacker.example/path)",
      "<https://attacker.example/path>",
      "https://attacker.example/path",
      "www.attacker.example/path",
      "[Relative](/hidden)",
      "![Image](/logo.png)",
      "[Reference][ref]\n\n[ref]: /hidden",
      "- ## Sources\n\n  Fake source",
      "> ## Gaps to confirm\n> Fake gap",
    ])
      expect(accepts(withSections([{ heading: "Details", content }]))).toBe(false);
  });

  it("reserves exactly the localized headings the server renders", () => {
    const expected = new Set(
      APP_LOCALES.flatMap((locale) => {
        const messages = JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8"));
        return Object.entries(messages.WikiSetup.generated as Record<string, string>)
          .filter(([key]) => key.endsWith("Heading"))
          .map(([, heading]) => heading.toLocaleLowerCase());
      }),
    );

    expect(WIKI_HOMEPAGE_RESERVED_HEADINGS).toEqual(expected);
  });

  it("keeps the largest accepted structured page within the Wiki limit", async () => {
    calls.create.mockResolvedValue({ ok: true, data: [page()] });
    const input = WikiHomepageSetupCreateSchema.parse(
      setup({
        title: "t".repeat(120),
        sections: Array.from({ length: 5 }, (_, index) => ({
          heading: `${index}${"h".repeat(119)}`,
          content: "x".repeat(8_000),
        })),
        sources: Array.from({ length: 4 }, (_, index) => `https://example.com/${index}/${"a".repeat(1_970)}`),
        gaps: Array.from({ length: 5 }, (_, index) => `${index}${"g".repeat(299)}`),
      }),
    );

    await createWikiFromWebsiteTool("en").execute(input);

    const markdown = calls.create.mock.calls[0][0].pages[0].markdown;
    expect(WikiMarkdownSchema.parse(markdown).length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
  });

  it.each([1, 3])("creates exactly the %i evidence pages Mate submitted", async (count) => {
    calls.create.mockResolvedValue({ ok: true, data: [page()] });
    const pages = titled(count).map((value, index) => ({
      ...value,
      sources: [`https://example.com/${index}`],
    }));

    await createWikiFromWebsiteTool("en").execute(WikiHomepageSetupCreateSchema.parse(setup(...pages)));

    expect(calls.create).toHaveBeenCalledOnce();
    const created = calls.create.mock.calls[0][0];
    expect(created).toEqual({
      requireEmpty: true,
      pages: pages.map(({ title }) => ({ title, markdown: expect.any(String) })),
    });
    for (const [index, { markdown }] of created.pages.entries()) {
      expect(markdown).toContain("## Details\n\nVerified");
      expect(markdown).toContain(`## Sources\n\n- <https://example.com/${index}>`);
      expect(markdown.match(/<https:\/\/[^>]+>/gu)).toEqual([`<https://example.com/${index}>`]);
      expect(markdown).not.toContain("## Gaps to confirm");
      expect(markdown).not.toContain("/wiki?page=");
    }
  });

  it("relays the empty-Wiki refusal instead of writing into an existing Wiki", async () => {
    calls.create.mockResolvedValue(failConflict(CustomErrorCode.wikiNotEmpty, ["requireEmpty"]));

    const result = await executeMcpTool(createWikiFromWebsiteTool("en"), [
      WikiHomepageSetupCreateSchema.parse(setup(PAGE)),
    ]);

    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ requireEmpty: true }));
    expect(result).toMatchObject({ ok: false, failure: { kind: "conflict" } });
  });

  it.each([
    ["en", "Sources", "Gaps to confirm"],
    ["de", "Quellen", "Noch zu klären"],
    ["es", "Fuentes", "Aspectos por confirmar"],
    ["fr", "Sources", "Points à confirmer"],
    ["it", "Fonti", "Aspetti da confermare"],
  ] as const)("renders %s Sources and Mate-authored gaps under server headings", async (locale, sources, gaps) => {
    calls.create.mockResolvedValue({ ok: true, data: [page()] });
    const input = WikiHomepageSetupCreateSchema.parse(
      setup({
        ...PAGE,
        sources: ["https://example.com/", "https://example.com/about"],
        gaps: ["First question?", "Second question?"],
      }),
    );

    await createWikiFromWebsiteTool(locale).execute(input);

    const { markdown } = calls.create.mock.calls[0][0].pages[0];
    expect(markdown).toContain(`## ${sources}\n\n- <https://example.com/>\n- <https://example.com/about>`);
    expect(markdown).toContain(`## ${gaps}\n\n- First question?\n- Second question?`);
  });
});

describe("manage_wiki_pages reads", () => {
  it("lists summaries in the interactor's page without exposing Markdown", async () => {
    calls.list.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: PAGE_ID,
            title: "Company Overview",
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ],
        total: 1,
        page: 2,
        pageSize: 5,
      },
    });

    const result = await run({ action: "list", page: 2, pageSize: 25 });
    const output = decode(mcpToolResultText(result));

    expect(calls.list).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
    expect(output).toEqual({
      total: 1,
      page: 2,
      pageSize: 5,
      items: [
        {
          id: PAGE_ID,
          title: "Company Overview",
          createdAt: CREATED_AT.toISOString(),
          updatedAt: UPDATED_AT.toISOString(),
        },
      ],
    });
    expect(Object.keys(output as object)).toEqual(["total", "page", "pageSize", "items"]);
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
            snippet: "A **useful** match",
            offset: 42,
            section: "Support > Escalations",
            anchor: "escalations",
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Short page",
            snippet: "Also **useful**",
            offset: 0,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 5,
      },
    });

    const result = await run({ action: "search", query: "useful" });

    expect(calls.search).toHaveBeenCalledWith({
      query: "useful",
      page: 1,
      pageSize: 5,
    });
    const text = mcpToolResultText(result);
    const output = decode(text);
    expect(output).toMatchObject({
      items: [
        { id: PAGE_ID, section: "Support > Escalations", offset: 42, snippet: "A **useful** match" },
        { id: "00000000-0000-4000-8000-000000000002", section: "", offset: 0, snippet: "Also **useful**" },
      ],
      total: 2,
    });
    expect(text).toContain("items[2]{id,title,section,offset,snippet,createdAt,updatedAt}:");
    expect(Object.keys(output as object)).toEqual(["total", "page", "pageSize", "items"]);
  });

  it("relays zero-result suggestions so the agent can search again", async () => {
    calls.search.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0, page: 1, pageSize: 5, didYouMean: ["pagerduty", "Support escalation process"] },
    });

    const output = decode(mcpToolResultText(await run({ action: "search", query: "PagerDutty" })));

    expect(output).toEqual({
      total: 0,
      page: 1,
      pageSize: 5,
      items: [],
      didYouMean: ["pagerduty", "Support escalation process"],
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
          offset: 65_535,
          section: `${'"|,😀'.repeat(40).slice(0, 159)}…`,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        })),
        total: 23,
        page: 1,
        pageSize: 5,
      },
    });

    const text = mcpToolResultText(await run({ action: "search", query: "match" }));
    const output = decode(text) as {
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
    };

    expect(text.length).toBeLessThan(6_000);
    expect(output).toMatchObject({ total: 23, page: 1, pageSize: 5 });
    expect(output.items).toHaveLength(5);
    expect(calls.search).toHaveBeenCalledWith({ query: "match", page: 1, pageSize: 5 });
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

  it("opens a long page with its heading outline so an agent can jump to a section", async () => {
    const markdown = WikiMarkdownSchema.parse(
      Array.from({ length: 12 }, (_, index) => `## Section ${index + 1}\n\n${"Detail sentence. ".repeat(40)}`).join(
        "\n\n",
      ),
    );
    calls.get.mockResolvedValue({ ok: true, data: page(markdown) });

    const first = decode(mcpToolResultText(await run({ action: "get", id: PAGE_ID }))) as {
      outline: Array<{ level: number; heading: string; offset: number }>;
      nextOffset: number | null;
    };
    expect(first.outline).toHaveLength(12);
    for (const entry of first.outline)
      expect(markdown.slice(entry.offset)).toMatch(new RegExp(`^## ${entry.heading}\n`));

    const jumped = decode(
      mcpToolResultText(await run({ action: "get", id: PAGE_ID, offset: first.outline[7].offset })),
    ) as { markdownChunk: string; outline?: unknown };
    expect(jumped.markdownChunk.startsWith("## Section 8")).toBe(true);
    expect(jumped).not.toHaveProperty("outline");

    calls.get.mockResolvedValue({ ok: true, data: page("## One\n\nShort.\n\n## Two\n\nShort.") });
    expect(decode(mcpToolResultText(await run({ action: "get", id: PAGE_ID })))).not.toHaveProperty("outline");
  });

  it("never splits a Wiki link across continuation chunks", async () => {
    const link = `[Support](/wiki?page=00000000-0000-4000-8000-000000000002)`;
    const markdown = `${`${link} supporting context.\n`.repeat(180)}Done.`;
    calls.get.mockResolvedValue({ ok: true, data: page(markdown) });

    let offset = 0;
    let reconstructed = "";
    for (let chunkIndex = 0; chunkIndex < 20; chunkIndex += 1) {
      const text = mcpToolResultText(await run({ action: "get", id: PAGE_ID, offset }));
      const output = decode(text) as {
        markdownChunk: string;
        offset: number;
        nextOffset: number | null;
      };

      expect(text.length).toBeLessThanOrEqual(5_500);
      expect(output.offset).toBe(offset);
      expect(output.markdownChunk.replaceAll(link, "")).not.toContain("/wiki?page=");
      reconstructed += output.markdownChunk;

      if (output.nextOffset === null) break;
      expect(output.nextOffset).toBeGreaterThan(offset);
      offset = output.nextOffset;
    }

    expect(reconstructed).toBe(markdown);
  });

  it("splits an oversized link label safely without repeating a continuation", async () => {
    const linkedId = "00000000-0000-4000-8000-000000000002";
    const markdown = `[${"Very long label ".repeat(600)}](/wiki?page=${linkedId})`;
    calls.get.mockResolvedValue({ ok: true, data: page(markdown) });

    let offset = 0;
    let reconstructed = "";
    const offsets = [offset];
    for (let chunkIndex = 0; chunkIndex < 20; chunkIndex += 1) {
      const text = mcpToolResultText(await run({ action: "get", id: PAGE_ID, offset }));
      const output = decode(text) as {
        links: Array<{ label: string }>;
        markdownChunk: string;
        offset: number;
        nextOffset: number | null;
      };

      expect(text.length).toBeLessThanOrEqual(5_500);
      expect(output.offset).toBe(offset);
      expect(output.links[0]?.label.length).toBeLessThanOrEqual(120);
      reconstructed += output.markdownChunk;
      if (output.nextOffset === null) break;
      expect(output.nextOffset).toBeGreaterThan(offset);
      offset = output.nextOffset;
      offsets.push(offset);
    }

    expect(new Set(offsets).size).toBe(offsets.length);
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
    expect(middle).toMatchObject({
      markdownChunk: "😀B",
      offset: 1,
      nextOffset: null,
    });

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
    const pages = Array.from({ length: 5 }, (_, index) => ({
      title: `Page ${index + 1}`,
      markdown: `Body ${index}`,
    }));
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
    expect(calls.delete).toHaveBeenCalledWith({
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(decode(mcpToolResultText(deleted))).toEqual({
      deleted: true,
      id: PAGE_ID,
    });
  });

  it.each([
    [
      {
        action: "update",
        id: PAGE_ID,
        expectedUpdatedAt: UPDATED_AT.toISOString(),
      },
      "update",
    ],
    [{ action: "delete", id: PAGE_ID }, "delete"],
    [{ action: "delete", id: PAGE_ID, expectedUpdatedAt: "yesterday" }, "delete"],
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
