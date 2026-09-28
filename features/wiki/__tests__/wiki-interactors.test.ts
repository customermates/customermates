import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { ForbiddenError } from "@/core/errors/app-errors";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";

import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { DeleteWikiPageInteractor } from "../delete-wiki-page.interactor";
import { GetWikiPageInteractor } from "../get-wiki-page.interactor";
import { GetWikiPagesInteractor } from "../get-wiki-pages.interactor";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";
import { WikiMarkdownSchema, type WikiPageDto } from "../wiki.schema";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const UPDATED_AT = new Date("2026-09-08T10:00:00.000Z");

function page(overrides: Partial<WikiPageDto> = {}): WikiPageDto {
  return {
    id: PAGE_ID,
    title: "Company Overview",
    markdown: "Original body",
    kind: "knowledge" as const,
    whenToUse: null,
    draft: false,
    createdAt: new Date("2026-09-08T09:00:00.000Z"),
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

const eventService = () => ({ publish: vi.fn().mockResolvedValue(undefined) });

beforeEach(() => vi.clearAllMocks());

describe("CreateWikiPagesInteractor", () => {
  it("publishes one complete snapshot for every atomically created page", async () => {
    const pages = [page(), page({ id: "00000000-0000-4000-8000-000000000002", title: "Offerings" })];
    const repo = {
      createPages: vi.fn().mockResolvedValue({ status: "created", pages }),
    };
    const events = eventService();

    const result = await new CreateWikiPagesInteractor(repo, events as never).invoke({
      pages: pages.map(({ title, markdown }) => ({ title, markdown })),
      requireEmpty: true,
    });

    expect(result).toEqual({ ok: true, data: pages });
    expect(repo.createPages).toHaveBeenCalledWith({
      pages: pages.map(({ title, markdown }) => ({
        title,
        markdown,
        id: expect.any(String),
      })),
      requireEmpty: true,
    });
    expect(events.publish.mock.calls).toEqual(
      pages.map((created) => [DomainEvent.WIKI_PAGE_CREATED, { entityId: created.id, payload: created }]),
    );
  });

  it("refuses the whole empty-only batch without publishing events", async () => {
    const repo = {
      createPages: vi.fn().mockResolvedValue({ status: "wiki-not-empty" }),
    };
    const events = eventService();

    const result = await new CreateWikiPagesInteractor(repo, events as never).invoke({
      pages: [{ title: "Company", markdown: "Body" }],
      requireEmpty: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]).toMatchObject({
        params: { error: CustomErrorCode.wikiNotEmpty },
      });
    }
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("preallocates ids without rewriting ordinary titles or Markdown", async () => {
    const repo = {
      createPages: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          status: "created",
          pages: data.pages.map((item: { id: string; title: string; markdown: string }) =>
            page({ ...item, createdAt: new Date(), updatedAt: new Date() }),
          ),
        }),
      ),
    };
    const events = eventService();
    const result = await new CreateWikiPagesInteractor(repo as never, events as never).invoke({
      pages: [
        {
          title: "Company overview",
          markdown: "Read [the source](https://example.com/source).",
        },
        {
          title: String.raw`Voice [external] \ handbook`,
          markdown: "Write clearly.",
        },
      ],
      requireEmpty: true,
    });

    expect(result.ok).toBe(true);
    const submitted = repo.createPages.mock.calls[0][0].pages;
    expect(submitted[0].title).toBe("Company overview");
    expect(submitted[0].markdown).toBe("Read [the source](https://example.com/source).");
    expect(submitted[1].title).toBe(String.raw`Voice [external] \ handbook`);
    expect(submitted.every((item: { id: string }) => /^[0-9a-f-]{36}$/.test(item.id))).toBe(true);
    expect(submitted.map((item: object) => Object.keys(item).toSorted())).toEqual([
      ["id", "markdown", "title"],
      ["id", "markdown", "title"],
    ]);
    expect(WikiMarkdownSchema.parse(submitted[0].markdown)).toBe(submitted[0].markdown);
  });

  it("returns a structured refusal when Markdown exceeds the cap", async () => {
    const repo = { createPages: vi.fn() };
    const events = eventService();

    const result = await new CreateWikiPagesInteractor(repo, events as never).invoke({
      pages: [
        {
          title: "Long page",
          markdown: "a".repeat(MAX_NOTES_LENGTH + 1),
        },
      ],
      requireEmpty: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["pages", 0, "markdown"],
        params: { error: CustomErrorCode.notesExceedsMaxLength },
      });
    }
    expect(repo.createPages).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe("UpdateWikiPageInteractor", () => {
  it("publishes the current page and exact prior/current Markdown changes", async () => {
    const previous = page();
    const current = page({
      title: "Updated overview",
      markdown: "Updated body",
      updatedAt: new Date("2026-09-08T11:00:00.000Z"),
    });
    const repo = {
      updatePage: vi.fn().mockResolvedValue({ status: "updated", previous, page: current }),
    };
    const events = eventService();

    const result = await new UpdateWikiPageInteractor(repo as never, events as never).invoke({
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT,
      title: current.title,
      markdown: current.markdown,
    });

    expect(result).toEqual({ ok: true, data: current });
    expect(events.publish).toHaveBeenCalledWith(DomainEvent.WIKI_PAGE_UPDATED, {
      entityId: PAGE_ID,
      payload: {
        wikiPage: current,
        changes: {
          title: { previous: previous.title, current: current.title },
          markdown: { previous: previous.markdown, current: current.markdown },
        },
      },
    });
  });

  it("suppresses the event when canonical data did not change", async () => {
    const unchanged = page();
    const repo = {
      updatePage: vi.fn().mockResolvedValue({
        status: "unchanged",
        previous: unchanged,
        page: unchanged,
      }),
    };
    const events = eventService();

    const result = await new UpdateWikiPageInteractor(repo as never, events as never).invoke({
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT,
      markdown: unchanged.markdown,
    });

    expect(result).toEqual({ ok: true, data: unchanged });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", CustomErrorCode.wikiPageNotFound],
    ["conflict", CustomErrorCode.wikiPageConflict],
  ] as const)("maps %s to its stable validation error", async (status, code) => {
    const repo = { updatePage: vi.fn().mockResolvedValue({ status }) };
    const events = eventService();

    const result = await new UpdateWikiPageInteractor(repo as never, events as never).invoke({
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT,
      title: "Updated",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]).toMatchObject({
        params: { error: code },
      });
    }
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe("DeleteWikiPageInteractor", () => {
  it("publishes the complete deleted snapshot", async () => {
    const deleted = page();
    const repo = {
      deletePage: vi.fn().mockResolvedValue({ status: "deleted", page: deleted }),
    };
    const events = eventService();

    const result = await new DeleteWikiPageInteractor(repo as never, events as never).invoke({
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT,
    });

    expect(result).toEqual({ ok: true, data: deleted });
    expect(events.publish).toHaveBeenCalledWith(DomainEvent.WIKI_PAGE_DELETED, {
      entityId: PAGE_ID,
      payload: deleted,
    });
  });

  it.each([
    ["not-found", CustomErrorCode.wikiPageNotFound],
    ["conflict", CustomErrorCode.wikiPageConflict],
  ] as const)("does not audit a %s delete", async (status, code) => {
    const repo = { deletePage: vi.fn().mockResolvedValue({ status }) };
    const events = eventService();

    const result = await new DeleteWikiPageInteractor(repo as never, events as never).invoke({
      id: PAGE_ID,
      expectedUpdatedAt: UPDATED_AT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues[0]).toMatchObject({ params: { error: code } });
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe.each(["legacy", "unified"] as const)("SearchWikiPagesInteractor (%s)", (pipeline) => {
  const markdown = WikiMarkdownSchema.parse(
    `Intro with [Support](/wiki?page=${PAGE_ID}).\n\n## Approval\n\nThe finance lead approves refunds.`,
  );
  const hit = { ...page({ markdown }), snippet: "The finance lead **approves** refunds.", section: "Approval" };
  beforeEach(() => {
    if (pipeline === "legacy") {
      vi.stubEnv("LOCAL_AGENT_BENCHMARK", "true");
      vi.stubEnv("AGENT_BENCHMARK_RETRIEVAL", "legacy");
    }
  });
  afterEach(() => vi.unstubAllEnvs());
  const search = (offsets: "stored" | "externalized") =>
    runWithTenant(mockUser, () =>
      new SearchWikiPagesInteractor(
        {
          searchPages: vi.fn().mockResolvedValue({
            items: [{ ...hit, offset: markdown.indexOf("## Approval") }],
            total: 1,
            page: 1,
            pageSize: 5,
          }),
          searchPageCandidates: vi.fn(),
          semanticPageCandidates: vi.fn(),
          getPagesByIds: vi.fn().mockResolvedValue([page({ markdown })]),
          fullTextPageCandidates: vi.fn().mockResolvedValue({ keys: [PAGE_ID], pinned: [] }),
          rankPageSections: vi.fn().mockResolvedValue(new Map([[1, 2.5]])),
          sectionHeadlines: vi.fn().mockResolvedValue(["The finance lead **approves** refunds."]),
        },
        offsets,
      ).invoke({ query: "approves", page: 1, pageSize: 5 }),
    );

  it("keeps stored offsets and never returns the page Markdown", async () => {
    const result = await search("stored");
    if (!result.ok) throw new Error("Expected a search result.");
    expect(result.data.items[0].offset).toBe(markdown.indexOf("## Approval"));
    expect(result.data.items[0]).toMatchObject({ section: "Approval", snippet: hit.snippet });
    expect(result.data.items[0]).not.toHaveProperty("markdown");
  });

  it("maps offsets onto the link-externalized Markdown from the searched page without another read", async () => {
    const result = await search("externalized");
    if (!result.ok) throw new Error("Expected a search result.");
    const externalized = markdown.replace("/wiki?page=", "http://localhost:4000/wiki?page=");
    expect(result.data.items[0].offset).toBe(externalized.indexOf("## Approval"));
    expect(result.data.items[0]).not.toHaveProperty("markdown");
  });
});

describe("Wiki permission boundary", () => {
  const noPermissions = createMockUserWithPermissions([]);
  const readUser = createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]);
  const manager = createMockUserWithPermissions(
    [Action.readAll, Action.create, Action.update, Action.delete].map((action) => ({
      resource: Resource.wiki,
      action,
    })),
  );

  it("requires Wiki Read for list, search, and get", async () => {
    const repo = {
      listPages: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }),
      searchPages: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }),
      searchPageCandidates: vi.fn(),
      semanticPageCandidates: vi.fn(),
      getPagesByIds: vi.fn().mockResolvedValue([]),
      fullTextPageCandidates: vi.fn().mockResolvedValue({ keys: [], pinned: [] }),
      rankPageSections: vi.fn().mockResolvedValue(new Map()),
      sectionHeadlines: vi.fn().mockResolvedValue([]),
      getPage: vi.fn().mockResolvedValue(page()),
    };
    const calls = [
      () => new GetWikiPagesInteractor(repo).invoke({ page: 1, pageSize: 25 }),
      () =>
        new SearchWikiPagesInteractor(repo, "stored").invoke({
          query: "company",
          page: 1,
          pageSize: 25,
        }),
      () => new GetWikiPageInteractor(repo).invoke({ id: PAGE_ID }),
    ];

    for (const call of calls) {
      await expect(runWithTenant(noPermissions, call as () => Promise<unknown>)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(runWithTenant(readUser, call as () => Promise<unknown>)).resolves.toMatchObject({ ok: true });
    }
  });

  it("does not let a read-only role create, update, or delete", async () => {
    const events = eventService();
    const calls = [
      () =>
        new CreateWikiPagesInteractor({ createPages: vi.fn() }, events as never).invoke({
          pages: [{ title: "Company", markdown: "Body" }],
          requireEmpty: false,
        }),
      () =>
        new UpdateWikiPageInteractor({ updatePage: vi.fn() }, events as never).invoke({
          id: PAGE_ID,
          expectedUpdatedAt: UPDATED_AT,
          title: "Updated",
        }),
      () =>
        new DeleteWikiPageInteractor({ deletePage: vi.fn() }, events as never).invoke({
          id: PAGE_ID,
          expectedUpdatedAt: UPDATED_AT,
        }),
    ];

    for (const call of calls)
      await expect(runWithTenant(readUser, call as () => Promise<unknown>)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a manager create, update, and delete through the same interactors used by UI and MCP", async () => {
    const created = page();
    const updated = page({
      markdown: "Updated",
      updatedAt: new Date("2026-09-08T11:00:00.000Z"),
    });
    const events = eventService();
    const calls = [
      () =>
        new CreateWikiPagesInteractor(
          {
            createPages: vi.fn().mockResolvedValue({ status: "created", pages: [created] }),
          },
          events as never,
        ).invoke({
          pages: [{ title: created.title, markdown: created.markdown }],
          requireEmpty: false,
        }),
      () =>
        new UpdateWikiPageInteractor(
          {
            updatePage: vi.fn().mockResolvedValue({
              status: "updated",
              previous: created,
              page: updated,
            }),
          },
          events as never,
        ).invoke({
          id: PAGE_ID,
          expectedUpdatedAt: UPDATED_AT,
          markdown: updated.markdown,
        }),
      () =>
        new DeleteWikiPageInteractor(
          {
            deletePage: vi.fn().mockResolvedValue({ status: "deleted", page: updated }),
          },
          events as never,
        ).invoke({ id: PAGE_ID, expectedUpdatedAt: updated.updatedAt }),
    ];

    for (const call of calls)
      await expect(runWithTenant(manager, call as () => Promise<unknown>)).resolves.toMatchObject({ ok: true });
  });
});
