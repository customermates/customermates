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
import { wikiExcerpt, wikiPlainText, wikiSearchTerms } from "../wiki-content";

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
    expect(wikiSearchTerms("_%!:&|")).toEqual([]);
    expect(wikiSearchTerms(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "))).toHaveLength(32);
  });
});

describe("GetWikiCatalogInteractor", () => {
  it("returns bounded navigation data and stable page URLs with explicit continuation", async () => {
    const repo = {
      listCatalogPages: vi.fn().mockResolvedValue({ items: [page], total: 11 }),
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
        total: 11,
        page: 1,
        nextPage: 2,
        truncated: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Private details later");
    expect(JSON.stringify(result)).not.toContain("markdown");
  });

  it("reports an empty catalog and the final page without false continuation", async () => {
    const repo = {
      listCatalogPages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
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
    const repo = { listCatalogPages: vi.fn() };
    expect(await new GetWikiCatalogInteractor(repo).invoke({ page: 0 })).toMatchObject({ ok: false });
    expect(repo.listCatalogPages).not.toHaveBeenCalled();
  });
});
