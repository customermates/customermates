import type { TenantUser } from "@/features/user/user.schema";
import type { WikiPageKind } from "../wiki.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { PermissionService } from "@/core/base/permission.service";
import { runWithTenant } from "@/core/decorators/tenant-context";
import {
  getGetWikiGraphInteractor,
  getGetWikiPageLinksInteractor,
  getPinWikiGraphNodeInteractor,
  getWikiGraphRepo,
} from "@/core/di";
import { ForbiddenError } from "@/core/errors/app-errors";
import { EventService } from "@/features/event/event.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type PageInput = { title: string; markdown: string; kind?: WikiPageKind; whenToUse?: string };

const TYPE_ID = "20000000-0000-4000-8000-000000000001";
const RECORD_ID = "30000000-0000-4000-8000-000000000001";
const MISSING_PAGE_ID = "40000000-0000-4000-8000-000000000001";
const STEPS = "1. Confirm the order.\n2. Refund within five days.";

function ok<T>(result: { ok: true; data: T } | { ok: false }): T {
  if (!result.ok) throw new Error("expected a successful result");
  return result.data;
}

describeDatabase("Knowledge Base map on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const foreignUser: TenantUser = createMockUser({ id: randomUUID(), companyId: foreignCompanyId });
  const readOnlyUser = createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]);
  const noAccessUser = createMockUserWithPermissions([]);

  const eventService = () =>
    new EventService([], {
      appendUnscoped: () => Promise.resolve(),
      hasSubscribersUnscoped: () => Promise.resolve(false),
    });
  const create = (pages: PageInput[], tenant = user) =>
    runWithTenant(tenant, () =>
      new CreateWikiPagesInteractor(new PrismaWikiPageRepo(new PermissionService()), eventService()).invoke({
        pages,
        requireEmpty: false,
      }),
    );
  const update = (data: Parameters<UpdateWikiPageInteractor["invoke"]>[0]) =>
    runWithTenant(user, () =>
      new UpdateWikiPageInteractor(new PrismaWikiPageRepo(new PermissionService()), eventService()).invoke(data),
    );
  const graph = (tenant = user) => runWithTenant(tenant, () => getGetWikiGraphInteractor().invoke({}));
  const pageLinks = (id: string, tenant = user) =>
    runWithTenant(tenant, () => getGetWikiPageLinksInteractor().invoke({ id }));
  const pin = (data: Parameters<ReturnType<typeof getPinWikiGraphNodeInteractor>["invoke"]>[0], tenant = user) =>
    runWithTenant(tenant, () => getPinWikiGraphNodeInteractor().invoke(data));
  const pageLink = (id: string) => `/wiki?page=${id}`;

  async function seedLinkedPages() {
    const [guide, refunds] = ok(
      await create([
        { title: "Operating Guide", markdown: "Be concise.", kind: "guide" },
        { title: "Refunds", markdown: STEPS, kind: "procedure", whenToUse: "Refund requests." },
      ]),
    );
    const [pricing] = ok(
      await create([
        {
          title: "Pricing",
          markdown: [
            `Plans follow the [guide](${pageLink(guide.id)}) and [refunds](${pageLink(refunds.id)}).`,
            `See [Acme](/records/${TYPE_ID}/${RECORD_ID}) and the [old page](${pageLink(MISSING_PAGE_ID)}).`,
          ].join("\n\n"),
        },
      ]),
    );
    const linkedRefunds = ok(
      await update({
        id: refunds.id,
        expectedUpdatedAt: refunds.updatedAt,
        markdown: `${STEPS}\n3. Check [pricing](${pageLink(pricing.id)}).`,
      }),
    );
    return { guide, refunds: linkedRefunds, pricing };
  }

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "WikiGraphLayout" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "WikiGraphLayout" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("derives links from the Markdown, counts them per page and keeps one saved layout", async () => {
    const { guide, refunds, pricing } = await seedLinkedPages();
    const first = ok(await graph());
    const node = (id: string) => first.nodes.find((candidate) => candidate.id === id);

    expect(first.nodes.map(({ id }) => id)).toEqual([guide.id, refunds.id, pricing.id]);
    expect(node(guide.id)).toMatchObject({
      kind: "guide",
      inbound: 1,
      outbound: 0,
      missing: 0,
      records: 0,
      x: 0.5,
      y: 0.5,
    });
    expect(node(pricing.id)).toMatchObject({ inbound: 1, outbound: 2, missing: 1, records: 1, pinned: false });
    expect(node(refunds.id)).toMatchObject({ inbound: 1, outbound: 1, whenToUse: "Refund requests." });
    expect(first.links).toEqual(
      expect.arrayContaining([
        { source: pricing.id, target: guide.id },
        { source: pricing.id, target: refunds.id },
        { source: refunds.id, target: pricing.id },
      ]),
    );
    expect(first.links).toHaveLength(3);
    expect(first.recordTypes).toEqual([]);
    expect(first.truncated).toBe(false);
    expect(first.syncing).toBe(false);
    for (const item of first.nodes) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThanOrEqual(1);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeLessThanOrEqual(1);
    }

    const stored = await client.query(
      'SELECT "pageId", "targetKind"::text, "targetId", "targetTypeId" FROM "WikiPageLink" WHERE "companyId" = $1 ORDER BY "pageId", "targetId"',
      [companyId],
    );
    expect(stored.rows).toContainEqual({
      pageId: pricing.id,
      targetKind: "record",
      targetId: RECORD_ID,
      targetTypeId: TYPE_ID,
    });
    expect(stored.rows).toContainEqual({
      pageId: pricing.id,
      targetKind: "page",
      targetId: MISSING_PAGE_ID,
      targetTypeId: null,
    });
    expect(stored.rowCount).toBe(5);

    const second = ok(await graph());
    expect(second.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      first.nodes.map(({ id, x, y }) => ({ id, x, y })),
    );
    const layouts = await client.query('SELECT COUNT(*)::int AS count FROM "WikiGraphLayout" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(layouts.rows[0].count).toBe(1);
  });

  it("re-syncs a changed page and leaves the untouched pages near their place", async () => {
    const { refunds, pricing } = await seedLinkedPages();
    const before = ok(await graph());
    ok(await update({ id: refunds.id, expectedUpdatedAt: refunds.updatedAt, markdown: STEPS }));
    const after = ok(await graph());
    expect(after.links).not.toContainEqual({ source: refunds.id, target: pricing.id });
    expect(after.nodes.find(({ id }) => id === pricing.id)).toMatchObject({ inbound: 0 });
    for (const item of after.nodes) {
      const previous = before.nodes.find(({ id }) => id === item.id);
      expect(previous).toBeDefined();
      expect(Math.hypot(item.x - (previous?.x ?? 0), item.y - (previous?.y ?? 0))).toBeLessThan(0.2);
    }
  });

  it("pins a page where a person put it, keeps the pin through a re-layout and unpins it again", async () => {
    const { pricing } = await seedLinkedPages();
    ok(await graph());
    expect(ok(await pin({ id: pricing.id, x: 0.9, y: 0.1 }))).toEqual({ id: pricing.id, pinned: true });
    expect(ok(await graph()).nodes.find(({ id }) => id === pricing.id)).toMatchObject({ x: 0.9, y: 0.1, pinned: true });

    ok(await create([{ title: "Shipping", markdown: `Ships with [pricing](${pageLink(pricing.id)}).` }]));
    const relaid = ok(await graph());
    expect(relaid.nodes).toHaveLength(4);
    expect(relaid.nodes.find(({ id }) => id === pricing.id)).toMatchObject({ x: 0.9, y: 0.1, pinned: true });

    expect(ok(await pin({ id: pricing.id, pinned: false }))).toEqual({ id: pricing.id, pinned: false });
    expect(ok(await graph()).nodes.find(({ id }) => id === pricing.id)).toMatchObject({
      x: 0.9,
      y: 0.1,
      pinned: false,
    });
    expect(await pin({ id: MISSING_PAGE_ID, x: 0.5, y: 0.5 })).toMatchObject({ ok: false });
  });

  it("keeps a pin that lands while a re-layout is being saved", async () => {
    const { pricing, guide } = await seedLinkedPages();
    ok(await graph());
    ok(await pin({ id: pricing.id, x: 0.9, y: 0.1 }));
    const saved = await runWithTenant(user, () =>
      getWikiGraphRepo().saveLayout({
        linksHash: "stale",
        positions: { [pricing.id]: { x: 0.2, y: 0.2 }, [guide.id]: { x: 0.5, y: 0.5 } },
      }),
    );
    expect(saved[pricing.id]).toEqual({ x: 0.9, y: 0.1, pinned: true });
    expect(saved[guide.id]).toEqual({ x: 0.5, y: 0.5 });
    expect(ok(await graph()).nodes.find(({ id }) => id === pricing.id)).toMatchObject({ x: 0.9, y: 0.1, pinned: true });
  });

  it("lists the links of one page in both directions and counts links to deleted pages", async () => {
    const { guide, refunds, pricing } = await seedLinkedPages();
    const links = ok(await pageLinks(pricing.id));
    expect(links.linkedFrom).toEqual([{ id: refunds.id, title: "Refunds", kind: "procedure" }]);
    expect(links.linksTo).toEqual([
      { id: guide.id, title: "Operating Guide", kind: "guide" },
      { id: refunds.id, title: "Refunds", kind: "procedure" },
    ]);
    expect(links.missing).toBe(1);
    expect(links.records).toEqual([]);
    expect(ok(await pageLinks(guide.id))).toMatchObject({ linkedFrom: [{ id: pricing.id }], linksTo: [], missing: 0 });
    expect(await pageLinks(MISSING_PAGE_ID)).toMatchObject({ ok: false });
  });

  it("drops a trashed page from the map and counts links to it as missing", async () => {
    const { refunds, pricing } = await seedLinkedPages();
    ok(await graph());
    await client.query('UPDATE "WikiPage" SET "deletedAt" = NOW() WHERE "id" = $1 AND "companyId" = $2', [
      refunds.id,
      companyId,
    ]);
    const after = ok(await graph());
    expect(after.nodes.map(({ id }) => id)).not.toContain(refunds.id);
    expect(after.nodes.find(({ id }) => id === pricing.id)).toMatchObject({ outbound: 1, missing: 2, inbound: 0 });
    expect(after.links).toEqual([{ source: pricing.id, target: after.nodes[0].id }]);
    expect(ok(await pageLinks(pricing.id))).toMatchObject({ linkedFrom: [], missing: 2 });
  });

  it("keeps the map of another workspace apart", async () => {
    const { pricing } = await seedLinkedPages();
    const [foreign] = ok(
      await create([{ title: "Foreign", markdown: `Reads [pricing](${pageLink(pricing.id)}).` }], foreignUser),
    );
    const own = ok(await graph());
    expect(own.nodes.map(({ id }) => id)).not.toContain(foreign.id);
    expect(own.nodes.find(({ id }) => id === pricing.id)).toMatchObject({ inbound: 1 });
    const theirs = ok(await graph(foreignUser));
    expect(theirs.nodes.map(({ id }) => id)).toEqual([foreign.id]);
    expect(theirs.nodes[0]).toMatchObject({ outbound: 0, missing: 1 });
    expect(await pageLinks(foreign.id)).toMatchObject({ ok: false });
  });

  it("needs Knowledge Base read access to see the map and edit access to pin", async () => {
    const { pricing } = await seedLinkedPages();
    await expect(graph({ ...noAccessUser, id: randomUUID(), companyId })).rejects.toBeInstanceOf(ForbiddenError);
    const readOnly = { ...readOnlyUser, id: randomUUID(), companyId };
    expect(ok(await graph(readOnly)).nodes).toHaveLength(3);
    await expect(pin({ id: pricing.id, x: 0.2, y: 0.2 }, readOnly)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
