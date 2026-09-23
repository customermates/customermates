import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { PrismaAuditLogRepo } from "@/features/audit-log/prisma-audit-log.repository";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import type { UpsertRoleData } from "@/features/role/upsert-role.interactor";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { DeleteWikiPageInteractor } from "../delete-wiki-page.interactor";
import { GetWikiPageInteractor } from "../get-wiki-page.interactor";
import { GetWikiPagesInteractor } from "../get-wiki-pages.interactor";
import { GetWikiCatalogInteractor } from "../get-wiki-catalog.interactor";
import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Workspace Wiki public boundaries on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const userId = randomUUID();
  const foreignUserId = randomUUID();
  const user: TenantUser = createMockUser({ id: userId, companyId });
  const foreignUser: TenantUser = createMockUser({
    id: foreignUserId,
    companyId: foreignCompanyId,
  });

  const eventService = () =>
    new EventService(
      [],
      {
        getWebhooksForEvent: () => Promise.resolve([]),
        getWebhooksForEventUnscoped: () => Promise.resolve([]),
      },
      {
        create: () => Promise.resolve([]),
        createUnscoped: () => Promise.resolve([]),
      },
      new PrismaAuditLogRepo(),
      { dispatch: () => Promise.resolve() } as never,
      {
        findEventRoutinesUnscoped: () => Promise.resolve([]),
        admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
      },
      {
        matchesCurrentUser: () => Promise.resolve(true),
        matchesUserUnscoped: () => Promise.resolve(true),
        canUserAccessUnscoped: () => Promise.resolve(true),
      },
    );

  const create = (tenant: TenantUser, pages: Array<{ title: string; markdown: string }>, requireEmpty = false) =>
    runWithTenant(tenant, () =>
      new CreateWikiPagesInteractor(new PrismaWikiPageRepo(), eventService()).invoke({ pages, requireEmpty }),
    );
  const update = (
    tenant: TenantUser,
    data: {
      id: string;
      expectedUpdatedAt: Date;
      title?: string;
      markdown?: string;
    },
  ) => runWithTenant(tenant, () => new UpdateWikiPageInteractor(new PrismaWikiPageRepo(), eventService()).invoke(data));
  const remove = (tenant: TenantUser, data: { id: string; expectedUpdatedAt: Date }) =>
    runWithTenant(tenant, () => new DeleteWikiPageInteractor(new PrismaWikiPageRepo(), eventService()).invoke(data));

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP), ($6, $7, $3, $4, $8, CURRENT_TIMESTAMP)',
      [
        userId,
        `wiki-${userId}@example.invalid`,
        "Wiki",
        "Tester",
        companyId,
        foreignUserId,
        `wiki-${foreignUserId}@example.invalid`,
        foreignCompanyId,
      ],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "AuditLog" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AuditLog" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  function customCode(result: unknown): unknown {
    if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== false) return null;
    const issue = (result as { error?: { issues?: unknown[] } }).error?.issues?.[0] as
      | { code?: string; params?: { error?: unknown } }
      | undefined;
    return issue?.code === "custom" ? issue.params?.error : null;
  }

  it("isolates list, search, get, update, and delete by the ambient company", async () => {
    const local = await create(user, [{ title: "Local page", markdown: "local-only phrase" }]);
    const foreign = await create(foreignUser, [{ title: "Foreign page", markdown: "foreign-only phrase" }]);
    if (!local.ok || !foreign.ok) throw new Error("Wiki fixtures were not created.");
    const foreignPage = foreign.data[0];

    const [listed, searched, loaded] = await runWithTenant(user, async () =>
      Promise.all([
        new GetWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({
          page: 1,
          pageSize: 25,
        }),
        new SearchWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({
          query: "foreign",
          page: 1,
          pageSize: 25,
        }),
        new GetWikiPageInteractor(new PrismaWikiPageRepo()).invoke({
          id: foreignPage.id,
        }),
      ]),
    );

    expect(listed).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ id: local.data[0].id }] },
    });
    expect(searched).toMatchObject({ ok: true, data: { total: 0, items: [] } });
    expect(loaded).toEqual({ ok: true, data: null });

    const foreignUpdate = await update(user, {
      id: foreignPage.id,
      expectedUpdatedAt: foreignPage.updatedAt,
      markdown: "stolen",
    });
    const foreignDelete = await remove(user, {
      id: foreignPage.id,
      expectedUpdatedAt: foreignPage.updatedAt,
    });
    expect(customCode(foreignUpdate)).toBe(CustomErrorCode.wikiPageNotFound);
    expect(customCode(foreignDelete)).toBe(CustomErrorCode.wikiPageNotFound);

    const untouched = await client.query('SELECT "markdown" FROM "WikiPage" WHERE "id" = $1', [foreignPage.id]);
    expect(untouched.rows).toEqual([{ markdown: foreignPage.markdown }]);
  });

  it("ranks title matches above body matches and supports multiple query terms without crossing tenants", async () => {
    const local = await create(user, [
      { title: "Older page", markdown: "Our voice is clear." },
      { title: "Voice", markdown: "Speak clearly." },
      { title: "Support", markdown: "Answer questions." },
    ]);
    await create(foreignUser, [{ title: "Voice support", markdown: "Foreign-only guidance." }]);
    if (!local.ok) throw new Error("Wiki fixtures were not created.");
    const search = (query: string, page = 1) =>
      runWithTenant(user, () =>
        new SearchWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({
          query,
          page,
          pageSize: 5,
        }),
      );
    const result = await search("voice support");
    expect(result).toMatchObject({ ok: true, data: { total: 3 } });
    if (!result.ok) throw new Error("Wiki search failed.");
    expect(result.data.items.map((item) => item.id)).toEqual([local.data[1].id, local.data[2].id, local.data[0].id]);
    expect(result.data.items[2].snippet).toBe("Our voice is clear.");
    expect(await search("voice support", 2)).toMatchObject({
      ok: true,
      data: { total: 3, items: [] },
    });
    expect(await search("_%!:&|")).toMatchObject({
      ok: true,
      data: { total: 0, items: [] },
    });
    expect(await search("'; DROP TABLE WikiPage;--")).toMatchObject({
      ok: true,
      data: { total: 0, items: [] },
    });
    expect(await search("voice")).toMatchObject({
      ok: true,
      data: { total: 2 },
    });
  });

  it("does not let request scaffolding crowd out the distinctive automatic Wiki match", async () => {
    const created = await create(user, [
      ...Array.from({ length: 3 }, (_, index) => ({
        title: `General guidance ${index + 1}`,
        markdown: "What is our current approach? ".repeat(80),
      })),
      {
        title: "Returns",
        markdown: `${"General background. ".repeat(80)}\n\nRefund policy requires manager approval.`,
      },
    ]);
    if (!created.ok) throw new Error("Wiki fixtures were not created.");
    const target = created.data[3];

    const catalog = await runWithTenant(user, () =>
      new GetWikiCatalogInteractor(new PrismaWikiPageRepo()).invoke({
        page: 1,
        query: "What is our refund policy?",
      }),
    );

    expect(catalog).toMatchObject({
      ok: true,
      data: {
        relevantPages: [
          {
            id: target.id,
            markdownPreview: expect.stringContaining("Refund policy requires manager approval"),
          },
        ],
      },
    });
  });

  it("finds non-English guidance and immediately reflects edits in search and catalog", async () => {
    const created = await create(user, [
      {
        title: "Kundenbetreuung",
        markdown: "Wir beantworten Rückfragen freundlich und präzise.",
      },
    ]);
    if (!created.ok) throw new Error("Wiki fixture was not created.");
    const page = created.data[0];
    const search = (query: string) =>
      runWithTenant(user, () =>
        new SearchWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({
          query,
          page: 1,
          pageSize: 5,
        }),
      );
    expect(await search("Rückfragen präzise")).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ id: page.id, title: "Kundenbetreuung" }] },
    });
    const changed = await update(user, {
      id: page.id,
      expectedUpdatedAt: page.updatedAt,
      markdown: "Antworten beginnen mit einer kurzen Zusammenfassung.",
    });
    expect(changed.ok).toBe(true);
    expect(await search("Rückfragen")).toMatchObject({
      ok: true,
      data: { total: 0 },
    });
    expect(await search("Zusammenfassung")).toMatchObject({
      ok: true,
      data: { total: 1 },
    });
    const catalog = await runWithTenant(user, () =>
      new GetWikiCatalogInteractor(new PrismaWikiPageRepo()).invoke({
        page: 1,
      }),
    );
    expect(catalog).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            id: page.id,
            excerpt: "Antworten beginnen mit einer kurzen Zusammenfassung.",
          },
        ],
      },
    });
  });

  it("finds interior CJK terms for manual search and automatic catalog discovery", async () => {
    const created = await create(user, [
      {
        title: "客户手册",
        markdown: "客户支持流程要求先确认账户，再解释退款政策。",
      },
      {
        title: "고객 안내서",
        markdown: "고객지원절차에서는 먼저 계정을 확인합니다.",
      },
    ]);
    await create(foreignUser, [
      {
        title: "支持",
        markdown: "其他租户的支持流程。",
      },
    ]);
    if (!created.ok) throw new Error("Wiki fixture was not created.");
    const page = created.data[0];

    const searched = await runWithTenant(user, () =>
      new SearchWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({
        query: "支持",
        page: 1,
        pageSize: 5,
      }),
    );
    expect(searched).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ id: page.id, title: "客户手册" }] },
    });

    const catalog = await runWithTenant(user, () =>
      new GetWikiCatalogInteractor(new PrismaWikiPageRepo()).invoke({
        page: 1,
        query: "如何处理支持请求？",
      }),
    );
    expect(catalog).toMatchObject({
      ok: true,
      data: {
        relevantPages: [
          {
            id: page.id,
            markdownPreview: expect.stringContaining("客户支持流程"),
          },
        ],
      },
    });
    expect(JSON.stringify(catalog)).not.toContain("其他租户");

    expect(
      await runWithTenant(user, () =>
        new SearchWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({
          query: "지원절차",
          page: 1,
          pageSize: 5,
        }),
      ),
    ).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ title: "고객 안내서" }] },
    });

    const longPrompt = `${Array.from({ length: 80 }, (_, index) => `generic${index}`).join(" ")} 支持`;
    const discovered = await runWithTenant(user, () =>
      new GetWikiCatalogInteractor(new PrismaWikiPageRepo()).invoke({
        page: 1,
        query: longPrompt,
      }),
    );
    expect(discovered).toMatchObject({
      ok: true,
      data: {
        relevantPages: expect.arrayContaining([expect.objectContaining({ id: page.id })]),
      },
    });
  });

  it("returns ten live catalog entries with accurate continuation and no foreign titles", async () => {
    for (let batch = 0; batch < 3; batch++) {
      await create(
        user,
        Array.from({ length: batch === 2 ? 1 : 5 }, (_, index) => ({
          title: `Local ${batch * 5 + index + 1}`,
          markdown: "# Heading\n\nA **helpful** opening.\n\nLater content is not a catalog excerpt.",
        })),
      );
    }
    await create(foreignUser, [{ title: "Foreign catalog entry", markdown: "Hidden" }]);
    const catalog = (page: number) =>
      runWithTenant(user, () => new GetWikiCatalogInteractor(new PrismaWikiPageRepo()).invoke({ page }));
    const first = await catalog(1);
    const second = await catalog(2);
    expect(first).toMatchObject({
      ok: true,
      data: { total: 11, nextPage: 2, truncated: true },
    });
    expect(second).toMatchObject({
      ok: true,
      data: { total: 11, nextPage: null, truncated: false },
    });
    if (!first.ok || !second.ok) throw new Error("Wiki catalog failed.");
    expect(first.data.items).toHaveLength(10);
    expect(second.data.items).toHaveLength(1);
    expect(new Set([...first.data.items, ...second.data.items].map((item) => item.id)).size).toBe(11);
    expect(first.data.items.every((item) => item.excerpt === "A helpful opening.")).toBe(true);
    expect(JSON.stringify([first, second])).not.toContain("Foreign catalog entry");
    expect(JSON.stringify([first, second])).not.toContain("Later content");
  });

  it("prefetches a tenant-scoped relevant page beyond the first catalog page", async () => {
    for (let batch = 0; batch < 2; batch++) {
      const created = await create(
        user,
        Array.from({ length: 5 }, (_, index) => ({
          title: `Reference ${batch * 5 + index + 1}`,
          markdown: `Reference body ${index + 1}`,
        })),
      );
      expect(created.ok).toBe(true);
    }
    const entry = await create(user, [
      {
        title: "Escalations",
        markdown: "The zephyr escalation requires a manager.",
      },
    ]);
    const foreignEntry = await create(foreignUser, [{ title: "Escalations", markdown: "Foreign zephyr guidance" }]);
    if (!entry.ok || !foreignEntry.ok) throw new Error("Wiki entry fixtures were not created.");
    const longQuery = `${Array.from({ length: 40 }, (_, index) => `a${index}`).join(" ")} zephyr escalation`;

    const first = await runWithTenant(user, () =>
      new GetWikiCatalogInteractor(new PrismaWikiPageRepo()).invoke({
        page: 1,
        query: longQuery,
      }),
    );
    const second = await runWithTenant(user, () =>
      new GetWikiCatalogInteractor(new PrismaWikiPageRepo()).invoke({
        page: 2,
        query: longQuery,
      }),
    );

    for (const catalog of [first, second]) {
      expect(catalog).toMatchObject({
        ok: true,
        data: {
          relevantPages: [
            {
              id: entry.data[0].id,
              title: "Escalations",
              markdownPreview: "The zephyr escalation requires a manager.",
            },
          ],
        },
      });
      expect(JSON.stringify(catalog)).not.toContain("Foreign zephyr guidance");
    }
    if (!first.ok) throw new Error("Wiki catalog failed.");
    expect(first.data.items.map((item) => item.id)).not.toContain(entry.data[0].id);
  });

  it("treats AGENTS.md as an ordinary duplicate title", async () => {
    const legacyIndex = await client.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1",
      ["WikiPage_companyId_agents_title_key"],
    );
    expect(legacyIndex.rows).toEqual([]);

    const outcomes = await Promise.all([
      create(user, [{ title: "agents.md", markdown: "First" }]),
      create(user, [{ title: " AGENTS.MD ", markdown: "Second" }]),
    ]);

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(2);
    const storedEntry = await client.query(
      'SELECT "title" FROM "WikiPage" WHERE "companyId" = $1 AND lower(btrim("title")) = $2 ORDER BY "title"',
      [companyId, "agents.md"],
    );
    expect(storedEntry.rows).toEqual([{ title: "AGENTS.MD" }, { title: "agents.md" }]);

    expect(await create(user, [{ title: "Duplicate", markdown: "One" }])).toMatchObject({ ok: true });
    expect(await create(user, [{ title: "Duplicate", markdown: "Two" }])).toMatchObject({ ok: true });
  });

  it("keeps empty-only setup pages unchanged in the transaction and audit snapshots", async () => {
    const created = await create(
      user,
      [
        { title: "Company overview", markdown: "Use the relevant page." },
        { title: "Voice", markdown: "Be direct." },
        { title: "Support", markdown: "Answer from evidence." },
      ],
      true,
    );
    if (!created.ok) throw new Error("Wiki setup batch was not created.");
    const [entry] = created.data;

    expect(entry.markdown).toBe("Use the relevant page.");
    const audit = await client.query(
      'SELECT "eventData" FROM "AuditLog" WHERE "companyId" = $1 AND "event" = $2 AND "entityId" = $3',
      [companyId, DomainEvent.WIKI_PAGE_CREATED, entry.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].eventData.payload.markdown).toBe(entry.markdown);
  });

  it("serializes same-token updates, suppresses no-ops, and rejects a stale delete", async () => {
    const created = await create(user, [{ title: "Concurrent page", markdown: "Original" }]);
    if (!created.ok) throw new Error("Wiki fixture was not created.");
    const pageId = created.data[0].id;
    await client.query('UPDATE "WikiPage" SET "updatedAt" = $1 WHERE "id" = $2', [
      new Date("2025-01-01T00:00:00.000Z"),
      pageId,
    ]);
    const loaded = await runWithTenant(user, () =>
      new GetWikiPageInteractor(new PrismaWikiPageRepo()).invoke({
        id: pageId,
      }),
    );
    if (!loaded.ok || !loaded.data) throw new Error("Wiki fixture could not be loaded.");
    const oldUpdatedAt = loaded.data.updatedAt;

    const outcomes = await Promise.all([
      update(user, {
        id: pageId,
        expectedUpdatedAt: oldUpdatedAt,
        markdown: "First winner",
      }),
      update(user, {
        id: pageId,
        expectedUpdatedAt: oldUpdatedAt,
        markdown: "Second winner",
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => customCode(outcome) === CustomErrorCode.wikiPageConflict)).toHaveLength(1);

    const current = await runWithTenant(user, () =>
      new GetWikiPageInteractor(new PrismaWikiPageRepo()).invoke({
        id: pageId,
      }),
    );
    if (!current.ok || !current.data) throw new Error("Updated Wiki page could not be loaded.");
    expect(["First winner", "Second winner"]).toContain(current.data.markdown);
    expect(current.data.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());

    const updateAudits = await client.query(
      'SELECT "eventData" FROM "AuditLog" WHERE "companyId" = $1 AND "event" = $2 AND "entityId" = $3',
      [companyId, DomainEvent.WIKI_PAGE_UPDATED, pageId],
    );
    expect(updateAudits.rows).toHaveLength(1);
    expect(updateAudits.rows[0].eventData.payload.changes.markdown).toEqual({
      previous: "Original",
      current: current.data.markdown,
    });

    const unchanged = await update(user, {
      id: pageId,
      expectedUpdatedAt: current.data.updatedAt,
      title: current.data.title,
      markdown: current.data.markdown,
    });
    expect(unchanged).toMatchObject({
      ok: true,
      data: { updatedAt: current.data.updatedAt },
    });
    const auditCountAfterNoOp = await client.query(
      'SELECT COUNT(*)::int AS "count" FROM "AuditLog" WHERE "companyId" = $1 AND "event" = $2 AND "entityId" = $3',
      [companyId, DomainEvent.WIKI_PAGE_UPDATED, pageId],
    );
    expect(auditCountAfterNoOp.rows[0].count).toBe(1);

    const staleDelete = await remove(user, {
      id: pageId,
      expectedUpdatedAt: oldUpdatedAt,
    });
    expect(customCode(staleDelete)).toBe(CustomErrorCode.wikiPageConflict);
    expect(await client.query('SELECT 1 FROM "WikiPage" WHERE "id" = $1', [pageId])).toMatchObject({ rowCount: 1 });
  });

  it("allows exactly one concurrent empty-only five-page batch and audits all five snapshots", async () => {
    const batch = (prefix: string) =>
      Array.from({ length: 5 }, (_, index) => ({
        title: `${prefix} ${index + 1}`,
        markdown: `Body ${index + 1}`,
      }));

    const outcomes = await Promise.all([create(user, batch("First"), true), create(user, batch("Second"), true)]);

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    const failure = outcomes.find((outcome) => !outcome.ok);
    expect(customCode(failure)).toBe(CustomErrorCode.wikiNotEmpty);

    const stored = await client.query(
      'SELECT "id", "title", "markdown" FROM "WikiPage" WHERE "companyId" = $1 ORDER BY "createdAt", "id"',
      [companyId],
    );
    expect(stored.rows).toHaveLength(5);
    const winningPrefix = stored.rows[0].title.startsWith("First") ? "First" : "Second";
    expect(stored.rows.map((row) => row.title)).toEqual(batch(winningPrefix).map((page) => page.title));

    const audits = await client.query(
      'SELECT "entityId", "eventData" FROM "AuditLog" WHERE "companyId" = $1 AND "event" = $2',
      [companyId, DomainEvent.WIKI_PAGE_CREATED],
    );
    expect(audits.rows).toHaveLength(5);
    expect(new Set(audits.rows.map((row) => row.entityId))).toEqual(new Set(stored.rows.map((row) => row.id)));
    for (const audit of audits.rows) expect(audit.eventData.payload).toMatchObject({ id: audit.entityId });
  });

  it("cascades Wiki pages when their company is deleted", async () => {
    const cascadeCompanyId = randomUUID();
    const pageId = randomUUID();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [cascadeCompanyId]);
    await client.query(
      'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [pageId, cascadeCompanyId, "Temporary", "Body"],
    );

    await client.query('DELETE FROM "Company" WHERE "id" = $1', [cascadeCompanyId]);

    expect(await client.query('SELECT 1 FROM "WikiPage" WHERE "id" = $1', [pageId])).toMatchObject({ rowCount: 0 });
  });

  it("persists Wiki Manage as CRUD plus Read, supports Read-only, and supports revocation", async () => {
    const repo = new PrismaRoleRepo();
    const roleName = `Wiki permissions ${randomUUID()}`;
    const permissions = (wiki: UpsertRoleData["permissions"]["wiki"]): UpsertRoleData["permissions"] => ({
      contacts: { canManage: "no", readAccess: "none" },
      deals: { canManage: "no", readAccess: "none" },
      organizations: { canManage: "no", readAccess: "none" },
      services: { canManage: "no", readAccess: "none" },
      users: { canManage: "no", readAccess: "own" },
      company: { canManage: "no" },
      api: { canManage: "no", readAccess: "none" },
      tasks: { canManage: "no", readAccess: "none" },
      inboxMessages: { canManage: "no", readAccess: "none" },
      routines: { canManage: "no", readAccess: "none" },
      wiki,
      auditLog: { readAccess: "none" },
    });
    const save = (id: string | undefined, wiki: UpsertRoleData["permissions"]["wiki"]) =>
      runWithTenant(user, () =>
        repo.upsertRoleOrThrow({
          id,
          name: roleName,
          description: "Wiki permission persistence test",
          permissions: permissions(wiki),
        }),
      );
    const wikiActions = async (roleId: string) => {
      const result = await client.query(
        'SELECT "action" FROM "RolePermission" WHERE "roleId" = $1 AND "resource" = $2 ORDER BY "action"',
        [roleId, "wiki"],
      );
      return result.rows.map(({ action }) => action);
    };

    const manager = await save(undefined, {
      canManage: "yes",
      readAccess: "none",
    });
    try {
      expect(await wikiActions(manager.id)).toEqual(["create", "readAll", "update", "delete"]);

      await save(manager.id, { canManage: "yes", readAccess: "all" });
      expect(await wikiActions(manager.id)).toEqual(["create", "readAll", "update", "delete"]);

      await save(manager.id, { canManage: "no", readAccess: "all" });
      expect(await wikiActions(manager.id)).toEqual(["readAll"]);

      await save(manager.id, { canManage: "no", readAccess: "none" });
      expect(await wikiActions(manager.id)).toEqual([]);

      const olderClientPermissions = permissions({
        canManage: "no",
        readAccess: "none",
      });
      delete olderClientPermissions.wiki;
      await runWithTenant(user, () =>
        repo.upsertRoleOrThrow({
          id: manager.id,
          name: roleName,
          description: "Updated by an older client",
          permissions: olderClientPermissions,
        }),
      );
      expect(await wikiActions(manager.id)).toEqual([]);
    } finally {
      await client.query('DELETE FROM "UserRole" WHERE "id" = $1', [manager.id]);
    }
  });
});
