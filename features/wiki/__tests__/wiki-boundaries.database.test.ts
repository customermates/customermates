import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  const foreignUser: TenantUser = createMockUser({ id: foreignUserId, companyId: foreignCompanyId });

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
    );

  const create = (tenant: TenantUser, pages: Array<{ title: string; markdown: string }>, requireEmpty = false) =>
    runWithTenant(tenant, () =>
      new CreateWikiPagesInteractor(new PrismaWikiPageRepo(), eventService()).invoke({ pages, requireEmpty }),
    );
  const update = (
    tenant: TenantUser,
    data: { id: string; expectedUpdatedAt: Date; title?: string; markdown?: string },
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
        new GetWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({ page: 1, pageSize: 25 }),
        new SearchWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({
          query: "foreign-only",
          page: 1,
          pageSize: 25,
        }),
        new GetWikiPageInteractor(new PrismaWikiPageRepo()).invoke({ id: foreignPage.id }),
      ]),
    );

    expect(listed).toMatchObject({ ok: true, data: { total: 1, items: [{ id: local.data[0].id }] } });
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

  it("serializes same-token updates, suppresses no-ops, and rejects a stale delete", async () => {
    const created = await create(user, [{ title: "Concurrent page", markdown: "Original" }]);
    if (!created.ok) throw new Error("Wiki fixture was not created.");
    const pageId = created.data[0].id;
    await client.query('UPDATE "WikiPage" SET "updatedAt" = $1 WHERE "id" = $2', [
      new Date("2025-01-01T00:00:00.000Z"),
      pageId,
    ]);
    const loaded = await runWithTenant(user, () =>
      new GetWikiPageInteractor(new PrismaWikiPageRepo()).invoke({ id: pageId }),
    );
    if (!loaded.ok || !loaded.data) throw new Error("Wiki fixture could not be loaded.");
    const oldUpdatedAt = loaded.data.updatedAt;

    const outcomes = await Promise.all([
      update(user, { id: pageId, expectedUpdatedAt: oldUpdatedAt, markdown: "First winner" }),
      update(user, { id: pageId, expectedUpdatedAt: oldUpdatedAt, markdown: "Second winner" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => customCode(outcome) === CustomErrorCode.wikiPageConflict)).toHaveLength(1);

    const current = await runWithTenant(user, () =>
      new GetWikiPageInteractor(new PrismaWikiPageRepo()).invoke({ id: pageId }),
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
    expect(unchanged).toMatchObject({ ok: true, data: { updatedAt: current.data.updatedAt } });
    const auditCountAfterNoOp = await client.query(
      'SELECT COUNT(*)::int AS "count" FROM "AuditLog" WHERE "companyId" = $1 AND "event" = $2 AND "entityId" = $3',
      [companyId, DomainEvent.WIKI_PAGE_UPDATED, pageId],
    );
    expect(auditCountAfterNoOp.rows[0].count).toBe(1);

    const staleDelete = await remove(user, { id: pageId, expectedUpdatedAt: oldUpdatedAt });
    expect(customCode(staleDelete)).toBe(CustomErrorCode.wikiPageConflict);
    expect(await client.query('SELECT 1 FROM "WikiPage" WHERE "id" = $1', [pageId])).toMatchObject({ rowCount: 1 });
  });

  it("allows exactly one concurrent empty-only five-page batch and audits all five snapshots", async () => {
    const batch = (prefix: string) =>
      Array.from({ length: 5 }, (_, index) => ({ title: `${prefix} ${index + 1}`, markdown: `Body ${index + 1}` }));

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

  it("backfills Wiki Read for every existing non-system role and remains idempotent", async () => {
    const regularRoleId = randomUUID();
    const systemRoleId = randomUUID();
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20260908120100_workspace_wiki_default_read/migration.sql"),
      "utf8",
    );

    await client.query("BEGIN");
    try {
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, false, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($4, $5, true, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [regularRoleId, `Wiki reader ${regularRoleId}`, companyId, systemRoleId, `Wiki admin ${systemRoleId}`],
      );

      await client.query(migration);
      await client.query(migration);

      const permissions = await client.query(
        'SELECT "roleId", "resource", "action" FROM "RolePermission" WHERE "roleId" = ANY($1) ORDER BY "roleId"',
        [[regularRoleId, systemRoleId]],
      );
      expect(permissions.rows).toEqual([{ roleId: regularRoleId, resource: "wiki", action: "readAll" }]);
    } finally {
      await client.query("ROLLBACK");
    }
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

    const manager = await save(undefined, { canManage: "yes", readAccess: "none" });
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
