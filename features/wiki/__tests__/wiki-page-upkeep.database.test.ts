import type { TenantUser } from "@/features/user/user.schema";
import type { WikiPageKind } from "../wiki.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PermissionService } from "@/core/base/permission.service";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { GetWikiPageInteractor } from "../get-wiki-page.interactor";
import { GetWikiPagesInteractor } from "../get-wiki-pages.interactor";
import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type PageInput = { title: string; markdown: string; kind?: WikiPageKind; whenToUse?: string; owner?: string };

const BODY = "Intro paragraph.\n\n## Pricing\n\nStandard plan: 20 EUR.\n\n## Contact\n\nWrite to support.";

function ok<T>(result: { ok: true; data: T } | { ok: false }): T {
  if (!result.ok) throw new Error("expected a successful result");
  return result.data;
}

function failure(result: unknown): { path: unknown; code: unknown } | null {
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== false) return null;
  const issue = (result as { error?: { issues?: Array<{ path?: unknown; params?: { error?: unknown } }> } }).error
    ?.issues?.[0];
  return { path: issue?.path, code: issue?.params?.error ?? null };
}

describeDatabase("Knowledge Base page upkeep on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const published: Array<{ event: unknown; payload: unknown }> = [];

  const eventService = () => {
    const service = new EventService([], {
      appendUnscoped: () => Promise.resolve(),
      hasSubscribersUnscoped: () => Promise.resolve(false),
    });
    const publish = service.publish.bind(service);
    service.publish = ((event: never, payload: never) => {
      published.push({ event, payload });
      return publish(event, payload);
    }) as typeof service.publish;
    return service;
  };
  const repo = () => new PrismaWikiPageRepo(new PermissionService());
  const create = (pages: PageInput[]) =>
    runWithTenant(user, () =>
      new CreateWikiPagesInteractor(repo(), eventService()).invoke({ pages, requireEmpty: false }),
    );
  const update = (data: Parameters<UpdateWikiPageInteractor["invoke"]>[0]) =>
    runWithTenant(user, () => new UpdateWikiPageInteractor(repo(), eventService()).invoke(data));
  const read = (id: string) => runWithTenant(user, () => new GetWikiPageInteractor(repo()).invoke({ id }));
  const list = () => runWithTenant(user, () => new GetWikiPagesInteractor(repo()).invoke({ page: 1, pageSize: 25 }));

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
  });

  beforeEach(async () => {
    published.length = 0;
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = $1', [companyId]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("changes parts of a page and stores the result as the page's canonical Markdown", async () => {
    const [page] = ok(await create([{ title: "Pricing", markdown: BODY }]));

    const edited = ok(
      await update({
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        edits: [
          { find: "20 EUR", replace: "25 EUR" },
          { anchor: "contact", markdown: "## Refunds\n\nWithin 14 days.", placement: "before" },
          { markdown: "## Changelog\n\n* Price raised." },
        ],
      }),
    );

    expect(edited.markdown).toBe(
      [
        "Intro paragraph.",
        "## Pricing",
        "Standard plan: 25 EUR.",
        "## Refunds",
        "Within 14 days.",
        "## Contact",
        "Write to support.",
        "## Changelog",
        "- Price raised.",
      ].join("\n\n"),
    );
    expect(edited.updatedAt.getTime()).toBeGreaterThan(page.updatedAt.getTime());
    expect(ok(await read(page.id)).markdown).toBe(edited.markdown);
  });

  it("leaves the page untouched when one edit does not fit, and names that edit", async () => {
    const [page] = ok(await create([{ title: "Pricing", markdown: BODY }]));

    const result = await update({
      id: page.id,
      expectedUpdatedAt: page.updatedAt,
      edits: [
        { find: "20 EUR", replace: "25 EUR" },
        { anchor: "refunds", markdown: "Text." },
      ],
    });

    expect(failure(result)).toEqual({ path: ["edits", 1], code: CustomErrorCode.wikiEditSectionNotFound });
    const stored = ok(await read(page.id));
    expect(stored.markdown).toBe(page.markdown);
    expect(stored.updatedAt).toEqual(page.updatedAt);
    expect(published.filter(({ event }) => event === DomainEvent.WIKI_PAGE_UPDATED)).toEqual([]);
  });

  it("refuses edits against an older version of the page", async () => {
    const [page] = ok(await create([{ title: "Pricing", markdown: BODY }]));
    ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, title: "Prices" }));

    const result = await update({
      id: page.id,
      expectedUpdatedAt: page.updatedAt,
      edits: [{ find: "20 EUR", replace: "25 EUR" }],
    });

    expect(failure(result)).toMatchObject({ code: CustomErrorCode.wikiPageConflict });
  });

  it("refuses edits that would make a procedure lose its numbered steps", async () => {
    const [page] = ok(
      await create([
        {
          title: "Refund a customer",
          markdown: "1. Confirm the order.\n2. Refund within five days.",
          kind: "procedure",
          whenToUse: "When a customer asks for a refund.",
        },
      ]),
    );

    const result = await update({
      id: page.id,
      expectedUpdatedAt: page.updatedAt,
      edits: [
        { find: "1. Confirm the order.\n", replace: "" },
        { find: "2. Refund within five days.", replace: "Refund within five days." },
      ],
    });

    expect(failure(result)).toMatchObject({ path: ["edits"] });
    expect(ok(await read(page.id)).markdown).toBe(page.markdown);
  });

  it("records an owner and a check on an older procedure that today's rule for steps would refuse", async () => {
    const [page] = ok(
      await create([
        {
          title: "Refund a customer",
          markdown: "1. Confirm the order.\n2. Refund within five days.",
          kind: "procedure",
          whenToUse: "When a customer asks for a refund.",
        },
      ]),
    );
    await client.query('UPDATE "WikiPage" SET "markdown" = $2 WHERE "id" = $1', [page.id, "Refund within five days."]);

    const marked = ok(
      await update({ id: page.id, expectedUpdatedAt: page.updatedAt, owner: "Finance", verified: true }),
    );
    const changed = await update({ id: page.id, expectedUpdatedAt: page.updatedAt, title: "Refunds" });

    expect(marked).toMatchObject({ owner: "Finance", updatedAt: page.updatedAt });
    expect(marked.verifiedAt).toBeInstanceOf(Date);
    expect(failure(changed)).toMatchObject({ code: CustomErrorCode.wikiProcedureNeedsSteps });
  });

  it("stores who looks after a page on create and update and clears it again", async () => {
    const [page] = ok(await create([{ title: "Pricing", markdown: BODY, owner: "  Sales team " }]));
    expect(page.owner).toBe("Sales team");

    const moved = ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, owner: "Finance" }));
    expect(moved.owner).toBe("Finance");
    expect(moved.updatedAt).toEqual(page.updatedAt);
    expect(ok(await list()).items.find(({ id }) => id === page.id)).toMatchObject({ owner: "Finance" });

    const cleared = ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, owner: null }));
    expect(cleared.owner ?? null).toBeNull();
    expect(ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, owner: "" })).owner ?? null).toBeNull();
  });

  it("records a check of the page without moving the date its text last changed", async () => {
    const [page] = ok(await create([{ title: "Pricing", markdown: BODY }]));
    expect(page.verifiedAt ?? null).toBeNull();
    const before = Date.now();

    const verified = ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, verified: true }));

    expect(verified.verifiedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(verified.updatedAt).toEqual(page.updatedAt);
    expect(verified.markdown).toBe(page.markdown);
    expect(published.filter(({ event }) => event === DomainEvent.WIKI_PAGE_UPDATED)).toHaveLength(1);

    const again = ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, verified: true }));
    expect(again.verifiedAt?.getTime()).toBeGreaterThanOrEqual(verified.verifiedAt?.getTime() ?? 0);
  });

  it("keeps the verified date when the text changes later, and moves both in one call", async () => {
    const [page] = ok(await create([{ title: "Pricing", markdown: BODY }]));
    const verified = ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, verified: true }));

    const edited = ok(
      await update({
        id: page.id,
        expectedUpdatedAt: verified.updatedAt,
        edits: [{ find: "20 EUR", replace: "25 EUR" }],
      }),
    );
    expect(edited.verifiedAt).toEqual(verified.verifiedAt);
    expect(edited.updatedAt.getTime()).toBeGreaterThan(verified.updatedAt.getTime());

    const both = ok(
      await update({
        id: page.id,
        expectedUpdatedAt: edited.updatedAt,
        edits: [{ find: "25 EUR", replace: "30 EUR" }],
        verified: true,
      }),
    );
    expect(both.updatedAt.getTime()).toBeGreaterThan(edited.updatedAt.getTime());
    expect(both.verifiedAt?.getTime()).toBeGreaterThanOrEqual(verified.verifiedAt?.getTime() ?? 0);
  });

  it("reports no change when an owner is set to what it already is", async () => {
    const [page] = ok(await create([{ title: "Pricing", markdown: BODY, owner: "Finance" }]));
    published.length = 0;

    const same = ok(await update({ id: page.id, expectedUpdatedAt: page.updatedAt, owner: "Finance" }));

    expect(same).toMatchObject({ owner: "Finance", updatedAt: page.updatedAt });
    expect(published).toEqual([]);
  });

  it("lists each page with the length of its text and without the text itself", async () => {
    const [short, emoji] = ok(
      await create([
        { title: "Short", markdown: "Hello." },
        { title: "Emoji", markdown: "Launch 🚀 today." },
      ]),
    );
    const stored = ok(await read(emoji.id));

    const { items } = ok(await list());

    expect(items.map(({ id, chars }) => ({ id, chars }))).toEqual([
      { id: short.id, chars: 6 },
      { id: emoji.id, chars: stored.markdown.length },
    ]);
    expect(stored.markdown.length).toBe(16);
    for (const item of items) expect(item).not.toHaveProperty("markdown");
  });
});
