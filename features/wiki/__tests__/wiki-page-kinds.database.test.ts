import { PermissionService } from "@/core/base/permission.service";
import type { TenantUser } from "@/features/user/user.schema";
import type { WikiPageKind } from "../wiki.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { EventService } from "@/features/event/event.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { GetWikiPagesInteractor } from "../get-wiki-pages.interactor";
import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { MoveWikiPageInteractor } from "../move-wiki-page.interactor";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type PageInput = { title: string; markdown: string; kind?: WikiPageKind; whenToUse?: string };

const STEPS = "1. Confirm the order.\n2. Refund within five days.";

function errorCode(result: unknown): unknown {
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== false) return null;
  const issue = (result as { error?: { issues?: Array<{ params?: { error?: unknown } }> } }).error?.issues?.[0];
  return issue?.params?.error ?? null;
}

describeDatabase("Workspace Wiki page kinds on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const foreignUser: TenantUser = createMockUser({ id: randomUUID(), companyId: foreignCompanyId });

  const eventService = () =>
    new EventService(
      [],
      { getWebhooksForEvent: () => Promise.resolve([]), getWebhooksForEventUnscoped: () => Promise.resolve([]) },
      { create: () => Promise.resolve([]), createUnscoped: () => Promise.resolve([]) },
      { log: () => Promise.resolve(), logUnscoped: () => Promise.resolve() },
      { dispatch: () => Promise.resolve() } as never,
      {
        findEventRoutinesUnscoped: () => Promise.resolve([]),
        admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
      },
      {
        matchesCurrentUser: () => Promise.resolve(true),
        currentUserTrigger: () => Promise.resolve(null),
        matchesUserUnscoped: () => Promise.resolve(true),
        canUserAccessUnscoped: () => Promise.resolve(true),
      },
    );
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

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("stores ordinary pages as usable knowledge and keeps when-to-use only on procedures", async () => {
    const result = await create([
      { title: "Pricing", markdown: "Plans start at 29 EUR." },
      { title: "Refunds", markdown: STEPS, kind: "procedure", whenToUse: "Use when a customer asks for money back." },
    ]);
    if (!result.ok) throw new Error("create failed");
    expect(result.data.map(({ title, kind, whenToUse }) => ({ title, kind, whenToUse }))).toEqual([
      { title: "Pricing", kind: "knowledge", whenToUse: null },
      { title: "Refunds", kind: "procedure", whenToUse: "Use when a customer asks for money back." },
    ]);

    const [pricing] = result.data;
    const changed = await update({
      id: pricing.id,
      expectedUpdatedAt: pricing.updatedAt,
      whenToUse: "Ignored because this is knowledge.",
    });
    expect(changed).toMatchObject({ ok: true, data: { kind: "knowledge", whenToUse: null } });
  });

  it("makes every saved kind immediately available to tenant-scoped assistant context", async () => {
    const created = await create([
      { title: "Operating Guide", markdown: "Be concise.", kind: "guide" },
      { title: "Refunds", markdown: STEPS, kind: "procedure", whenToUse: "Refund requests." },
      { title: "Pricing", markdown: "Plans start at 29 EUR." },
    ]);
    expect(created.ok).toBe(true);
    await create([{ title: "Foreign guide", markdown: "Foreign rules.", kind: "guide" }], foreignUser);
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiPageRepo(new PermissionService());
      const context = await repo.loadOperatingPages(20);
      expect(context.guide).toMatchObject({ title: "Operating Guide" });
      expect(context.procedures.map(({ title }) => title)).toEqual(["Refunds"]);
      expect(context.proceduresTotal).toBe(1);
      const catalog = await repo.listCatalogPages({ page: 1 });
      expect(catalog.items.map(({ title }) => title)).toEqual(["Pricing"]);
      expect(catalog.total).toBe(1);
      expect(context.guide).not.toHaveProperty("draft");
      expect(catalog.items[0]).not.toHaveProperty("draft");
    });
    const columns = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WikiPage' AND column_name = 'draft'",
    );
    expect(columns.rowCount).toBe(0);
  });

  it("requires a trigger and numbered steps for procedures", async () => {
    expect(errorCode(await create([{ title: "Refunds", markdown: STEPS, kind: "procedure" }]))).toBe(
      CustomErrorCode.wikiWhenToUseRequired,
    );
    expect(
      errorCode(
        await create([{ title: "Refunds", markdown: "Refund quickly.", kind: "procedure", whenToUse: "Refund asks." }]),
      ),
    ).toBe(CustomErrorCode.wikiProcedureNeedsSteps);

    const created = await create([{ title: "Refunds", markdown: "Refund quickly." }]);
    if (!created.ok) throw new Error("create failed");
    const [page] = created.data;
    expect(
      errorCode(
        await update({ id: page.id, expectedUpdatedAt: page.updatedAt, kind: "procedure", whenToUse: "Refunds." }),
      ),
    ).toBe(CustomErrorCode.wikiProcedureNeedsSteps);
    expect(
      await update({
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        kind: "procedure",
        whenToUse: "Refunds.",
        markdown: STEPS,
      }),
    ).toMatchObject({ ok: true, data: { kind: "procedure", whenToUse: "Refunds." } });
  });

  it("allows one Operating Guide per workspace and filters lists by kind", async () => {
    const guide = await create([{ title: "Operating Guide", markdown: "Be concise.", kind: "guide" }]);
    if (!guide.ok) throw new Error("create failed");
    expect(errorCode(await create([{ title: "Second guide", markdown: "Be loud.", kind: "guide" }]))).toBe(
      CustomErrorCode.wikiGuideExists,
    );
    expect(
      errorCode(
        await create([
          { title: "A", markdown: "a", kind: "guide" },
          { title: "B", markdown: "b", kind: "guide" },
        ]),
      ),
    ).toBe(CustomErrorCode.wikiGuideExists);
    expect(await create([{ title: "Foreign guide", markdown: "Hi.", kind: "guide" }], foreignUser)).toMatchObject({
      ok: true,
    });

    const other = await create([{ title: "Tone", markdown: "Warm." }]);
    if (!other.ok) throw new Error("create failed");
    const [tone] = other.data;
    expect(errorCode(await update({ id: tone.id, expectedUpdatedAt: tone.updatedAt, kind: "guide" }))).toBe(
      CustomErrorCode.wikiGuideExists,
    );
    await expect(
      client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "kind", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
        [randomUUID(), companyId, "Raced guide", "x", "guide"],
      ),
    ).rejects.toThrow(/WikiPage_companyId_guide_key/);

    const guides = await runWithTenant(user, () =>
      new GetWikiPagesInteractor(new PrismaWikiPageRepo(new PermissionService())).invoke({
        page: 1,
        pageSize: 25,
        kind: "guide",
      }),
    );
    expect(guides).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ title: "Operating Guide", kind: "guide" }] },
    });
  });

  it("enforces when-to-use presence for procedures in the database itself", async () => {
    await expect(
      client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "kind", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
        [randomUUID(), companyId, "Raw procedure", STEPS, "procedure"],
      ),
    ).rejects.toThrow(/WikiPage_when_to_use_matches_kind/);
  });
  it("persists shared ordering across pagination without changing content revisions", async () => {
    const inputs: PageInput[] = [
      { title: "Guide", markdown: "Be clear.", kind: "guide" },
      ...Array.from({ length: 7 }, (_, index) => ({ title: `Page ${index}`, markdown: `Content ${index}` })),
    ];
    const firstBatch = await create(inputs.slice(0, 5));
    const secondBatch = await create(inputs.slice(5));
    if (!firstBatch.ok || !secondBatch.ok) throw new Error("create failed");
    const created = { ok: true, data: [...firstBatch.data, ...secondBatch.data] };
    if (!created.ok) throw new Error("create failed");
    const [guide, first, second, ...rest] = created.data;
    const last = rest.at(-1);
    if (!last || !user.role) throw new Error("Missing test fixture");
    const move = (id: string, targetId: string, placement: "before" | "after") =>
      runWithTenant(user, () =>
        new MoveWikiPageInteractor(new PrismaWikiPageRepo(new PermissionService())).invoke({ id, targetId, placement }),
      );
    expect(await move(last.id, first.id, "before")).toMatchObject({ ok: true });
    const listed = await runWithTenant(user, () =>
      new GetWikiPagesInteractor(new PrismaWikiPageRepo(new PermissionService())).invoke({ page: 1, pageSize: 5 }),
    );
    expect(listed.ok && listed.data.items.map(({ id }) => id)).toEqual([
      guide.id,
      last.id,
      first.id,
      second.id,
      rest[0].id,
    ]);
    const unchanged = await runWithTenant(user, () => new PrismaWikiPageRepo(new PermissionService()).getPage(last.id));
    expect(unchanged).toEqual(last);
    expect(await update({ id: last.id, expectedUpdatedAt: last.updatedAt, title: "Still editable" })).toMatchObject({
      ok: true,
    });
    expect(await move(first.id, second.id, "after")).toMatchObject({ ok: true });
    expect(await move(first.id, first.id, "before")).toMatchObject({ ok: true });
    expect(await create([{ title: "Appended", markdown: "New content" }])).toMatchObject({ ok: true });
    const all = await runWithTenant(user, () =>
      new PrismaWikiPageRepo(new PermissionService()).listPages({ page: 1, pageSize: 25 }),
    );
    expect(all.items.map(({ title }) => title)).toEqual([
      "Guide",
      "Still editable",
      "Page 1",
      "Page 0",
      "Page 2",
      "Page 3",
      "Page 4",
      "Page 5",
      "Appended",
    ]);
    expect(errorCode(await move(guide.id, first.id, "after"))).toBe(CustomErrorCode.wikiPagePinned);
    expect(errorCode(await move(first.id, guide.id, "before"))).toBe(CustomErrorCode.wikiPagePinned);
    const foreign = await create([{ title: "Foreign", markdown: "Private" }], foreignUser);
    if (!foreign.ok) throw new Error("create failed");
    expect(errorCode(await move(first.id, foreign.data[0].id, "before"))).toBe(CustomErrorCode.wikiPageNotFound);
    expect(errorCode(await move(foreign.data[0].id, first.id, "before"))).toBe(CustomErrorCode.wikiPageNotFound);
    const reader = createMockUser({ ...user, role: { ...user.role, isSystemRole: false, permissions: [] } });
    await expect(
      runWithTenant(reader, () =>
        new MoveWikiPageInteractor(new PrismaWikiPageRepo(new PermissionService())).invoke({
          id: first.id,
          targetId: second.id,
          placement: "after",
        }),
      ),
    ).rejects.toThrow("Access denied");
    expect(
      await runWithTenant(user, () =>
        new PrismaWikiPageRepo(new PermissionService()).listPages({ page: 1, pageSize: 25 }),
      ),
    ).toEqual(all);
  });
});
