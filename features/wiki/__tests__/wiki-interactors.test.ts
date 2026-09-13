import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";

import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { DeleteWikiPageInteractor } from "../delete-wiki-page.interactor";
import { GetWikiPageInteractor } from "../get-wiki-page.interactor";
import { GetWikiPagesInteractor } from "../get-wiki-pages.interactor";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";
import type { WikiPageDto } from "../wiki.schema";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const UPDATED_AT = new Date("2026-09-08T10:00:00.000Z");

function page(overrides: Partial<WikiPageDto> = {}): WikiPageDto {
  return {
    id: PAGE_ID,
    title: "Company Overview",
    markdown: "Original body",
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
    const repo = { createPages: vi.fn().mockResolvedValue(pages) };
    const events = eventService();

    const result = await new CreateWikiPagesInteractor(repo, events as never).invoke({
      pages: pages.map(({ title, markdown }) => ({ title, markdown })),
      requireEmpty: true,
    });

    expect(result).toEqual({ ok: true, data: pages });
    expect(repo.createPages).toHaveBeenCalledWith({
      pages: pages.map(({ title, markdown }) => ({ title, markdown })),
      requireEmpty: true,
    });
    expect(events.publish.mock.calls).toEqual(
      pages.map((created) => [DomainEvent.WIKI_PAGE_CREATED, { entityId: created.id, payload: created }]),
    );
  });

  it("refuses the whole empty-only batch without publishing events", async () => {
    const repo = { createPages: vi.fn().mockResolvedValue(null) };
    const events = eventService();

    const result = await new CreateWikiPagesInteractor(repo, events as never).invoke({
      pages: [{ title: "Company", markdown: "Body" }],
      requireEmpty: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues[0]).toMatchObject({ params: { error: CustomErrorCode.wikiNotEmpty } });
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
    const repo = { updatePage: vi.fn().mockResolvedValue({ status: "updated", previous, page: current }) };
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
      updatePage: vi.fn().mockResolvedValue({ status: "unchanged", previous: unchanged, page: unchanged }),
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
    if (!result.ok) expect(result.error.issues[0]).toMatchObject({ params: { error: code } });
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe("DeleteWikiPageInteractor", () => {
  it("publishes the complete deleted snapshot", async () => {
    const deleted = page();
    const repo = { deletePage: vi.fn().mockResolvedValue({ status: "deleted", page: deleted }) };
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
      getPage: vi.fn().mockResolvedValue(page()),
    };
    const calls = [
      () => new GetWikiPagesInteractor(repo).invoke({ page: 1, pageSize: 25 }),
      () => new SearchWikiPagesInteractor(repo).invoke({ query: "company", page: 1, pageSize: 25 }),
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
    const updated = page({ markdown: "Updated", updatedAt: new Date("2026-09-08T11:00:00.000Z") });
    const events = eventService();
    const calls = [
      () =>
        new CreateWikiPagesInteractor({ createPages: vi.fn().mockResolvedValue([created]) }, events as never).invoke({
          pages: [{ title: created.title, markdown: created.markdown }],
          requireEmpty: false,
        }),
      () =>
        new UpdateWikiPageInteractor(
          {
            updatePage: vi.fn().mockResolvedValue({ status: "updated", previous: created, page: updated }),
          },
          events as never,
        ).invoke({ id: PAGE_ID, expectedUpdatedAt: UPDATED_AT, markdown: updated.markdown }),
      () =>
        new DeleteWikiPageInteractor(
          { deletePage: vi.fn().mockResolvedValue({ status: "deleted", page: updated }) },
          events as never,
        ).invoke({ id: PAGE_ID, expectedUpdatedAt: updated.updatedAt }),
    ];

    for (const call of calls)
      await expect(runWithTenant(manager, call as () => Promise<unknown>)).resolves.toMatchObject({ ok: true });
  });
});
