import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@toon-format/toon";

import { ForbiddenError } from "@/core/errors/app-errors";
import { WikiMarkdownSchema, WIKI_MARKDOWN_MAX_LENGTH } from "@/features/wiki/wiki.schema";
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
import { manageWikiPagesTool, WikiHomepageSetupCreateSchema, wikiHomepageSetupTool } from "../wiki.mcp-tools";
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
    const validPages = [
      "company_overview",
      "products_services",
      "customers_competitors",
      "voice_tone",
      "support_faq",
    ].map((topic) => ({
      topic,
      sections: [{ heading: "Details", content: "Body" }],
      sources: [`https://example.com/${topic}`],
    }));

    expect(
      WikiHomepageSetupCreateSchema.safeParse({
        action: "create",
        pages: validPages.map((page, index) => (index === 4 ? { ...page, sections: [], sources: [] } : page)),
        requireEmpty: true,
      }).success,
    ).toBe(true);
    for (const invalid of [
      { action: "list" },
      { action: "create", pages: [], requireEmpty: true },
      { action: "create", pages: validPages.slice(0, 4), requireEmpty: true },
      {
        action: "create",
        pages: [...validPages.slice(0, 4), validPages[0]],
        requireEmpty: true,
      },
      {
        action: "create",
        pages: validPages.map((page, index) => (index === 0 ? { ...page, sections: [] } : page)),
        requireEmpty: true,
      },
      {
        action: "create",
        pages: validPages.map((page, index) => (index === 0 ? { ...page, sources: [] } : page)),
        requireEmpty: true,
      },
      {
        action: "create",
        pages: validPages.map((page) => ({
          ...page,
          sections: [],
          sources: [],
        })),
        requireEmpty: true,
      },
      { action: "create", pages: validPages, requireEmpty: false },
      { action: "update", pages: validPages, requireEmpty: true },
    ])
      expect(WikiHomepageSetupCreateSchema.safeParse(invalid).success).toBe(false);
  });

  it("normalizes structured section Markdown before storage", () => {
    const pages = ["company_overview", "products_services", "customers_competitors", "voice_tone", "support_faq"].map(
      (topic) => ({
        topic,
        sections: [
          {
            heading: "## Useful &mdash; section",
            content: "Verified &mdash; content &#8212; more\n\nSetext label\n---\n\n### Nested label",
          },
        ],
        sources: [`https://example.com/${topic}`],
      }),
    );
    const parsed = WikiHomepageSetupCreateSchema.parse({
      action: "create",
      pages,
      requireEmpty: true,
    });

    expect(parsed.pages[0].sections).toEqual([
      {
        heading: "Useful - section",
        content: "Verified - content - more\n\nSetext label\n\nNested label",
      },
    ]);
    expect(parsed.pages[0].sections[0]?.content).not.toMatch(/[—#]/u);
    expect(parsed.pages[0].sections[0]?.heading).not.toContain("—");
    expect(
      WikiHomepageSetupCreateSchema.safeParse({
        action: "create",
        requireEmpty: true,
        pages: pages.map((page, index) =>
          index === 0
            ? {
                ...page,
                sections: [{ heading: "Two\nlines", content: "Body" }],
              }
            : page,
        ),
      }).success,
    ).toBe(false);
    expect(
      WikiHomepageSetupCreateSchema.safeParse({
        action: "create",
        requireEmpty: true,
        pages: pages.map((page, index) =>
          index === 0
            ? {
                ...page,
                sections: [{ heading: "—".repeat(120), content: "Body" }],
              }
            : page,
        ),
      }).success,
    ).toBe(false);
  });

  it("accepts zero to five structured sections without model-authored headings", () => {
    const topics = [
      "company_overview",
      "products_services",
      "customers_competitors",
      "voice_tone",
      "support_faq",
    ] as const;
    const setup = (sections: { heading: string; content: string }[]) => ({
      action: "create" as const,
      requireEmpty: true as const,
      pages: topics.map((topic) => ({
        topic,
        sections,
        sources: sections.length ? [`https://example.com/${topic}`] : [],
      })),
    });

    expect(WikiHomepageSetupCreateSchema.safeParse(setup([{ heading: "Verified", content: "Content" }])).success).toBe(
      true,
    );
    expect(
      WikiHomepageSetupCreateSchema.safeParse(
        setup(
          Array.from({ length: 5 }, (_, index) => ({
            heading: `Section ${index + 1}`,
            content: "Content",
          })),
        ),
      ).success,
    ).toBe(true);
    expect(
      WikiHomepageSetupCreateSchema.safeParse(
        setup(
          Array.from({ length: 6 }, (_, index) => ({
            heading: `Section ${index + 1}`,
            content: "Content",
          })),
        ),
      ).success,
    ).toBe(false);
    expect(WikiHomepageSetupCreateSchema.safeParse(setup([{ heading: "Details", content: " " }])).success).toBe(false);
    expect(
      WikiHomepageSetupCreateSchema.safeParse(setup([{ heading: "Details", content: "x".repeat(8_001) }])).success,
    ).toBe(false);
    expect(
      WikiHomepageSetupCreateSchema.safeParse(setup([{ heading: "Details", content: "[".repeat(8_000) }])).success,
    ).toBe(false);
    for (const heading of [
      "Sources",
      "Quellen",
      "Fuentes",
      "Points à confirmer",
      "Pagine correlate",
      "**Sources**",
      "_Gaps to confirm_",
      "`Sources`",
      "Sources ##",
      "[Linked heading](/wiki?page=00000000-0000-4000-8000-000000000001)",
    ])
      expect(WikiHomepageSetupCreateSchema.safeParse(setup([{ heading, content: "Content" }])).success).toBe(false);
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
      expect(WikiHomepageSetupCreateSchema.safeParse(setup([{ heading: "Details", content }])).success).toBe(false);
  });

  it("keeps the largest accepted structured page within the Wiki limit", async () => {
    calls.create.mockResolvedValue({ ok: true, data: [page()] });
    const topics = [
      "company_overview",
      "products_services",
      "customers_competitors",
      "voice_tone",
      "support_faq",
    ] as const;
    const longSources = Array.from({ length: 4 }, (_, index) => `https://example.com/${index}/${"a".repeat(1_970)}`);
    const input = WikiHomepageSetupCreateSchema.parse({
      action: "create",
      requireEmpty: true,
      pages: topics.map((topic, pageIndex) => ({
        topic,
        sections:
          pageIndex === 0
            ? Array.from({ length: 5 }, (_, sectionIndex) => ({
                heading: `${sectionIndex}${"h".repeat(119)}`,
                content: "x".repeat(8_000),
              }))
            : [{ heading: "Details", content: "Supported" }],
        sources: pageIndex === 0 ? longSources : [`https://example.com/${topic}`],
      })),
    });

    await wikiHomepageSetupTool("en").execute(input);

    const markdown = calls.create.mock.calls[0][0].pages[0].markdown;
    expect(WikiMarkdownSchema.parse(markdown).length).toBeLessThanOrEqual(WIKI_MARKDOWN_MAX_LENGTH);
  });

  it.each([
    [
      "en",
      [
        "Company Overview",
        "Products, Services & Value",
        "Customers, Market & Competition",
        "Voice, Tone & Messaging",
        "Sales, Onboarding & Support",
      ],
      "Gaps to confirm",
      "Sources",
      "Related pages",
    ],
    [
      "de",
      [
        "Unternehmensüberblick",
        "Produkte, Leistungen und Mehrwert",
        "Kunden, Markt und Wettbewerb",
        "Sprache, Ton und Botschaften",
        "Vertrieb, Onboarding und Support",
      ],
      "Noch zu klären",
      "Quellen",
      "Verwandte Seiten",
    ],
    [
      "es",
      [
        "Resumen de la empresa",
        "Productos, servicios y valor",
        "Clientes, mercado y competencia",
        "Voz, tono y mensajes",
        "Ventas, incorporación de clientes y soporte",
      ],
      "Aspectos por confirmar",
      "Fuentes",
      "Páginas relacionadas",
    ],
    [
      "fr",
      [
        "Présentation de l’entreprise",
        "Produits, services et valeur",
        "Clients, marché et concurrence",
        "Voix, ton et messages",
        "Ventes, intégration client et support",
      ],
      "Points à confirmer",
      "Sources",
      "Pages associées",
    ],
    [
      "it",
      [
        "Panoramica dell’azienda",
        "Prodotti, servizi e valore",
        "Clienti, mercato e concorrenza",
        "Voce, tono e messaggi",
        "Vendite, onboarding e supporto",
      ],
      "Aspetti da confermare",
      "Fonti",
      "Pagine correlate",
    ],
  ] as const)(
    "generates trusted %s titles, source links, and headings on the server",
    async (locale, titles, gaps, sources, related) => {
      calls.create.mockResolvedValue({ ok: true, data: [page()] });
      const input = WikiHomepageSetupCreateSchema.parse({
        action: "create",
        requireEmpty: true,
        pages: ["company_overview", "products_services", "customers_competitors", "voice_tone", "support_faq"].map(
          (topic) => ({
            topic,
            sections: [{ heading: "Details", content: `Verified ${topic}` }],
            sources: [`https://example.com/${topic}`],
          }),
        ),
      });

      await wikiHomepageSetupTool(locale).execute(input);

      expect(calls.create).toHaveBeenCalledWith({
        requireEmpty: true,
        pages: titles.map((title, index) =>
          expect.objectContaining({
            title,
            setupRelatedHeading: related,
            markdown: expect.stringContaining(`## ${gaps}`),
            setupTopic: input.pages[index].topic,
          }),
        ),
      });
      for (const [index, created] of calls.create.mock.calls[0][0].pages.entries()) {
        expect(created.markdown).toContain(`## ${sources}`);
        expect(created.markdown).toContain(`<https://example.com/${input.pages[index].topic}>`);
      }
    },
  );

  it("creates an honest gaps-only page without an empty Sources section", async () => {
    calls.create.mockResolvedValue({ ok: true, data: [page()] });
    const input = WikiHomepageSetupCreateSchema.parse({
      action: "create",
      requireEmpty: true,
      pages: ["company_overview", "products_services", "customers_competitors", "voice_tone", "support_faq"].map(
        (topic, index) => ({
          topic,
          sections: index === 4 ? [] : [{ heading: "Details", content: `Supported ${topic}` }],
          sources: index === 4 ? [] : [`https://example.com/${topic}`],
        }),
      ),
    });

    await wikiHomepageSetupTool("en").execute(input);

    const gapsOnly = calls.create.mock.calls[0][0].pages[4].markdown;
    expect(gapsOnly).toBe(
      "## Gaps to confirm\n\n- Which sales stages, qualification rules, CRM fields, and owners should Mate follow?\n- What are the handoffs, support channels, service levels, and escalation paths?\n- Which routines need human approval, and who gives it?",
    );
    expect(gapsOnly).not.toContain("## Sources");
  });

  it("adds a tailored review question to every starter page", async () => {
    calls.create.mockResolvedValue({ ok: true, data: [page()] });
    const input = WikiHomepageSetupCreateSchema.parse({
      action: "create",
      requireEmpty: true,
      pages: ["company_overview", "products_services", "customers_competitors", "voice_tone", "support_faq"].map(
        (topic) => ({
          topic,
          sections: [{ heading: "Details", content: `Supported ${topic}` }],
          sources: [`https://example.com/${topic}`],
        }),
      ),
    });

    await wikiHomepageSetupTool("en").execute(input);

    const completePage = calls.create.mock.calls[0][0].pages[0].markdown;
    expect(completePage).toContain("## Sources");
    expect(completePage).toContain("## Gaps to confirm");
    expect(completePage).toContain(
      "Which mission, story, markets, and company facts should Mate treat as authoritative?",
    );
    expect(completePage).toContain("Which proof points and contact paths should Mate use?");
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

    expect(calls.search).toHaveBeenCalledWith({
      query: "useful",
      page: 1,
      pageSize: 5,
    });
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
    const output = decode(text) as {
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
    };

    expect(text.length).toBeLessThan(6_000);
    expect(output).toMatchObject({ total: 23, page: 1, pageSize: 5 });
    expect(output.items).toHaveLength(5);
    expect(
      manageWikiPagesTool.inputSchema.safeParse({
        action: "search",
        query: "match",
        pageSize: 10,
      }).success,
    ).toBe(false);
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
