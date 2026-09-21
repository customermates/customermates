import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { ForbiddenError } from "@/core/errors/app-errors";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { GetWikiCatalogInteractor } from "../get-wiki-catalog.interactor";
import {
  wikiExcerpt,
  wikiPlainText,
  wikiRelevantSearchTerms,
  wikiSearchSnippet,
  wikiSearchTerms,
  wikiSubstringSearchTerms,
} from "../wiki-content";

const id = "00000000-0000-4000-8000-000000000001";
const page = {
  id,
  title: "Voice and tone",
  markdown: "# Voice and tone\n\nWrite **clearly** and [helpfully](https://example.com).\n\nPrivate details later.",
  createdAt: new Date("2026-09-13T10:00:00Z"),
  updatedAt: new Date("2026-09-13T11:00:00Z"),
};

beforeEach(() => vi.clearAllMocks());

describe("Wiki catalog content", () => {
  it("derives a plain first paragraph without headings, link targets, or later content", () => {
    expect(wikiExcerpt(page.markdown)).toBe("Write clearly and helpfully.");
    expect(wikiPlainText(page.markdown)).toBe("Voice and tone Write clearly and helpfully. Private details later.");
  });

  it("keeps Unicode excerpts within 200 characters without splitting a surrogate pair", () => {
    const excerpt = wikiExcerpt("a".repeat(198) + "😀".repeat(20));
    expect(excerpt.length).toBeLessThanOrEqual(200);
    expect(excerpt).toBe("a".repeat(198) + "…");
    expect(wikiExcerpt("")).toBe("");
    expect(wikiExcerpt("# Only a heading")).toBe("Only a heading");
  });

  it("extracts bounded Unicode query terms rather than passing query syntax through", () => {
    expect(wikiSearchTerms("VOICE, voice / Für Kunden? 2026")).toEqual(["voice", "für", "kunden", "2026"]);
    expect(wikiSearchTerms("如何处理支持请求？")).toEqual(["如何处理支持请求", "如何", "处理", "支持", "请求"]);
    expect(wikiSearchTerms("_%!:&|")).toEqual([]);
    expect(wikiSearchTerms(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "))).toHaveLength(32);
    expect(
      wikiRelevantSearchTerms(
        `${"a to our ".repeat(20)}${Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ")} distinctiveprocess`,
      ),
    ).toContain("distinctiveprocess");
    expect(wikiRelevantSearchTerms("a")).toEqual(["a"]);
    expect(
      wikiRelevantSearchTerms(`${Array.from({ length: 80 }, (_, index) => `generic${index}`).join(" ")} tone`),
    ).toContain("tone");
    expect(wikiSubstringSearchTerms(["support", "客户支持流程", "サポート", "고객지원절차", "บริการ"])).toEqual([
      "客户支持流程",
      "サポート",
      "고객지원절차",
      "บริการ",
    ]);
  });

  it("keeps query-centered snippets inside the catalog excerpt limit", () => {
    const snippet = wikiSearchSnippet(`${"Before ".repeat(80)}needle ${"after ".repeat(80)}😀`, "needle");
    expect(snippet.length).toBeLessThanOrEqual(200);
    expect(snippet).toContain("needle");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.endsWith("\ud83c")).toBe(false);
  });

  it("never starts or ends a search snippet inside an astral character", () => {
    const snippet = wikiSearchSnippet(`${"🌍".repeat(41)}needle${"🌍".repeat(100)}`, "needle");
    const first = snippet.charCodeAt(snippet.startsWith("…") ? 1 : 0);
    const last = snippet.charCodeAt(snippet.length - (snippet.endsWith("…") ? 2 : 1));
    expect(first >= 0xdc00 && first <= 0xdfff).toBe(false);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    expect(snippet).toContain("needle");
  });
});

describe("GetWikiCatalogInteractor", () => {
  it("returns bounded navigation data and stable page URLs with explicit continuation", async () => {
    const repo = {
      listCatalogPages: vi.fn().mockResolvedValue({ items: [page], total: 11 }),
      findRelevantCatalogPages: vi.fn().mockResolvedValue([]),
    };
    const result = await new GetWikiCatalogInteractor(repo).invoke({ page: 1 });
    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          {
            id,
            title: page.title,
            excerpt: "Write clearly and helpfully.",
            url: `http://localhost:4000/wiki?page=${id}`,
            createdAt: page.createdAt,
            updatedAt: page.updatedAt,
          },
        ],
        relevantPages: [],
        total: 11,
        page: 1,
        nextPage: 2,
        truncated: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Private details later");
    expect(JSON.stringify(result)).not.toContain("markdown");
  });

  it("returns bounded query-matched previews independently of catalog pagination", async () => {
    const relevant = {
      ...page,
      id: "00000000-0000-4000-8000-000000000002",
      title: "Refund policy",
      markdown: `${"Background. ".repeat(80)}\n\nRefunds require manager review.\n\n${"😀".repeat(3_000)}`,
    };
    const repo = {
      listCatalogPages: vi.fn().mockResolvedValue({ items: [page], total: 11 }),
      findRelevantCatalogPages: vi.fn().mockResolvedValue([relevant]),
    };
    const result = await new GetWikiCatalogInteractor(repo).invoke({
      page: 2,
      query: "refund manager",
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        relevantPages: [
          {
            id: relevant.id,
            title: relevant.title,
            url: `http://localhost:4000/wiki?page=${relevant.id}`,
            totalChars: relevant.markdown.length,
          },
        ],
        page: 2,
      },
    });
    if (!result.ok) throw new Error("Expected relevant Wiki context.");
    const preview = result.data.relevantPages[0];
    expect(preview.excerpt.length).toBeLessThanOrEqual(200);
    expect(preview.markdownPreview).toContain("Refunds require manager review");
    expect(preview.previewEnd).toBeLessThan(preview.totalChars);
    const finalCode = preview.markdownPreview.charCodeAt(preview.markdownPreview.length - 1);
    expect(finalCode >= 0xd800 && finalCode <= 0xdbff).toBe(false);
    expect(repo.findRelevantCatalogPages).toHaveBeenCalledWith({
      query: "refund manager",
    });
  });

  it("reports an empty catalog and the final page without false continuation", async () => {
    const repo = {
      listCatalogPages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findRelevantCatalogPages: vi.fn().mockResolvedValue([]),
    };
    expect(await new GetWikiCatalogInteractor(repo).invoke({ page: 1 })).toMatchObject({
      ok: true,
      data: { items: [], total: 0, nextPage: null, truncated: false },
    });
    repo.listCatalogPages.mockResolvedValue({ items: [page], total: 11 });
    expect(await new GetWikiCatalogInteractor(repo).invoke({ page: 2 })).toMatchObject({
      ok: true,
      data: { total: 11, page: 2, nextPage: null, truncated: false },
    });
  });

  it("requires Wiki Read before querying titles or counts and accepts the read-only role", async () => {
    const repo = {
      listCatalogPages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findRelevantCatalogPages: vi.fn().mockResolvedValue([]),
    };
    const interactor = new GetWikiCatalogInteractor(repo);
    await expect(
      runWithTenant(createMockUserWithPermissions([]), () => interactor.invoke({ page: 1 })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.listCatalogPages).not.toHaveBeenCalled();
    await expect(
      runWithTenant(createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]), () =>
        interactor.invoke({ page: 1 }),
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects invalid pagination before querying", async () => {
    const repo = {
      listCatalogPages: vi.fn(),
      findRelevantCatalogPages: vi.fn(),
    };
    expect(await new GetWikiCatalogInteractor(repo).invoke({ page: 0 })).toMatchObject({ ok: false });
    expect(repo.listCatalogPages).not.toHaveBeenCalled();
  });
});
