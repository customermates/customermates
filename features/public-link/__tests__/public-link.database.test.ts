import type { RestRouteWorkspace } from "@/tests/helpers/rest-route-workspace";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const SECRET = "public-link-test-secret-0123456789abcdef";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    BETTER_AUTH_SECRET: "public-link-test-secret-0123456789abcdef",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { createMockUser } = await import("@/tests/helpers/mock-user");
const di = await import("@/core/di");
const { ReadPublicLinkInteractor } = await import("../read-public-link.interactor");
const { PrismaPublicLinkRepo } = await import("../prisma-public-link.repository");
const { PublicLinkRateLimiter } = await import("../public-link-rate-limiter");
const { PublicLinkTenant } = await import("../public-link-tenant");
const { PublicLinkAccess } = await import("../public-link-access");
const { ReadPublicWidgetRecordsInteractor } = await import("../read-public-widget-records.interactor");
const { ReadPublicListRecordsInteractor } = await import("../read-public-list-records.interactor");
const { publicLinkToken } = await import("../public-link-token");

const routes = {
  createView: await restRoute("/v1/data-views/create"),
  removeView: await restRoute("/v1/data-views/delete"),
  publish: await restRoute("/v1/data-views/publish"),
  saveWidget: await restRoute("/v1/widgets/save"),
};

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

function access(options: { now?: Date; perLink?: number; secret?: string } = {}) {
  return new PublicLinkAccess(
    new PrismaPublicLinkRepo(),
    new PublicLinkTenant(di.getUserService()),
    { invoke: (data) => di.getGetWidgetsInteractor().invoke(data) },
    new PublicLinkRateLimiter(options.perLink ?? 1000, 60_000),
    new PublicLinkRateLimiter(1000, 60_000),
    { authSecret: options.secret ?? SECRET, ...(options.now ? { now: () => options.now as Date } : {}) },
  );
}

function reader(options: { now?: Date; perLink?: number; secret?: string } = {}) {
  return new ReadPublicLinkInteractor(
    access(options),
    new PrismaPublicLinkRepo(),
    { cacheMs: 0 },
    {
      invoke: () => di.getGetRecordNavigationInteractor().invoke(),
    },
    presentation,
  );
}

const presentation = {
  invoke: (input: Parameters<ReturnType<typeof di.getGetRecordPresentationInteractor>["invoke"]>[0]) =>
    di.getGetRecordPresentationInteractor().invoke(input),
};

function records(options: { now?: Date; perLink?: number } = {}) {
  return new ReadPublicWidgetRecordsInteractor(access(options), presentation);
}

function listRecords(options: { now?: Date; perLink?: number } = {}) {
  return new ReadPublicListRecordsInteractor(access(options), presentation);
}

const tokenOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);

async function board(w: RestRouteWorkspace, user: TenantUser, name: string) {
  const created = await postAs(w, user, routes.createView, { surfaceKey: "dashboard", name, state: {} });
  if (created.status !== 200) throw new Error(JSON.stringify(created.body));
  const viewKey = created.body.viewKey as string;
  for (const [widgetName, displayOptions] of [
    ["Deals", { displayType: "number" }],
    ["Deals by stage", { displayType: "verticalBarChart" }],
  ] as const) {
    const saved = await postAs(w, user, routes.saveWidget, {
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      name: widgetName,
      measure: {
        source: { typeId: w.id("deal"), filters: [], relationships: [] },
        aggregation: "count",
        valueFieldId: null,
        groupBy: widgetName === "Deals" ? null : { path: [], fieldId: w.id("deal.stage") },
      },
      displayOptions,
      isTemplate: false,
      viewId: viewKey,
    });
    if (saved.status !== 200) throw new Error(JSON.stringify(saved.body));
  }
  return viewKey;
}

const publish = (w: RestRouteWorkspace, user: TenantUser, viewKey: string, extra: Record<string, unknown> = {}) =>
  postAs(w, user, routes.publish, { surfaceKey: "dashboard", viewKey, public: true, ...extra });

const total = (result: Awaited<ReturnType<ReturnType<typeof reader>["invoke"]>>) =>
  result.status === "available" && "dashboard" in result
    ? result.dashboard.widgets[0]?.data?.total.count
    : result.status;

describeDatabase("public dashboard links on PostgreSQL", () => {
  it("publishes a dashboard view by link, shows only charts calculated with the creator's access and stops on every revoking condition", async () => {
    const w = await workspace();
    const other = await workspace();
    await w.grant("deal", ["readOwn", "create"]);
    const assigned = await w.create("deal", "deal.name", "Rollout for Pia", w.member);
    const ownerOnly = await w.create("deal", "deal.name", "Owner-only budget");

    const adminBoard = await board(w, w.admin, "Investor board");

    const initial = await w.as(w.admin, () =>
      di.getManagePublicLinkInteractor().invoke({ action: "read", viewId: adminBoard }),
    );
    expect(initial).toEqual({ ok: true, data: { allowed: true, reason: null, link: null } });

    const published = await publish(w, w.admin, adminBoard);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const url = published.body.publicLink.url as string;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:4000\/p\/[0-9a-f]{64}$/u);
    const token = tokenOf(url);

    const open = await reader().invoke({ token, visitor: "visitor-a" });
    expect(open.status).toBe("available");
    if (open.status !== "available" || !("dashboard" in open)) throw new Error("not available");
    expect(open.dashboard).toMatchObject({ name: "Investor board", expiresAt: null, hiddenWidgetCount: 0 });
    expect(open.dashboard.widgets.map((widget) => widget.name)).toEqual(["Deals", "Deals by stage"]);
    expect(open.dashboard.widgets[0]?.listLabels).toMatchObject({ pluralLabel: expect.any(String) });
    expect(open.dashboard.widgets[0]?.listLabels?.pluralLabel).not.toBe("");
    expect(total(open)).toBe(2);
    const serialized = JSON.stringify(open.dashboard);
    for (const secret of [
      w.companyId,
      w.admin.id,
      w.member.id,
      assigned.recordId,
      ownerOnly.recordId,
      adminBoard,
      "Rollout for Pia",
      "Owner-only budget",
    ])
      expect(serialized).not.toContain(secret);

    const all = await records().invoke({ token, widget: 0, group: null, label: null });
    expect(all.status).toBe("available");
    if (all.status !== "available") throw new Error("records not available");
    expect(all.presentation.result.items).toHaveLength(2);
    expect(all.presentation.permittedActions).toEqual([]);
    expect(all.presentation.canManageSchema).toBe(false);
    const stageChart = open.dashboard.widgets[1];
    const filled = stageChart?.data?.groups.find((group) => (group.count ?? 0) > 0);
    if (!filled) throw new Error("no filled stage group");
    const inGroup = await records().invoke({
      token,
      widget: 1,
      group: { record: filled.record, label: filled.label },
      label: "stage",
    });
    expect(inGroup.status === "available" && inGroup.presentation.result.items.length).toBe(filled.count);
    for (const forged of [
      { widget: 1, group: { record: null, label: { state: "value", value: { kind: "text", value: "Forged" } } } },
      { widget: 7, group: null },
      { widget: -1, group: null },
    ]) {
      expect(
        (await records().invoke({ token, label: null, ...(forged as { widget: number; group: null }) })).status,
      ).toBe("unavailable");
    }
    expect(
      (await records().invoke({ token: `${token.slice(0, 63)}x`, widget: 0, group: null, label: null })).status,
    ).toBe("unavailable");

    const counted = await runWithoutTenant(() =>
      prisma.publicViewLink.findFirstOrThrow({ where: { viewId: adminBoard, revokedAt: null } }),
    );
    expect(counted.openCount).toBe(1);

    const memberBoard = await board(w, w.member, "My board");
    const refused = await publish(w, w.member, memberBoard);
    expect(refused.status).toBe(403);
    expect(
      await w.as(w.member, () => di.getManagePublicLinkInteractor().invoke({ action: "read", viewId: memberBoard })),
    ).toMatchObject({ ok: true, data: { allowed: false, reason: "permissionDenied", link: null } });
    expect((await publish(w, w.member, adminBoard)).status).toBe(404);
    expect((await publish(other, other.admin, adminBoard)).status).toBe(404);

    const permission = await runWithoutTenant(() =>
      prisma.rolePermission.create({
        data: { roleId: w.member.roleId as string, companyId: w.companyId, resource: "publicLinks", action: "create" },
      }),
    );
    const publisher = createMockUser({
      ...w.member,
      role: {
        ...(w.member.role as NonNullable<TenantUser["role"]>),
        permissions: [{ resource: "publicLinks", action: "create" }],
      },
    } as never);
    const memberLink = await publish(w, publisher, memberBoard);
    expect(memberLink.status, JSON.stringify(memberLink.body)).toBe(200);
    const memberToken = tokenOf(memberLink.body.publicLink.url as string);
    expect(total(await reader().invoke({ token: memberToken }))).toBe(1);
    const memberRows = await records().invoke({ token: memberToken, widget: 0, group: null, label: null });
    expect(
      memberRows.status === "available" && memberRows.presentation.result.items.map((row) => row.ref.recordId),
    ).toEqual([assigned.recordId]);

    expect((await publish(w, w.admin, adminBoard, { expiresAt: "2001-01-01" })).status).toBe(400);
    const withEnd = await publish(w, w.admin, adminBoard, { expiresAt: "2099-12-31" });
    expect(withEnd.body.publicLink).toMatchObject({ url, expiresAt: "2099-12-31" });
    expect((await reader({ now: new Date("2099-12-31T23:00:00Z") }).invoke({ token })).status).toBe("available");
    expect((await reader({ now: new Date("2100-01-01T00:00:01Z") }).invoke({ token })).status).toBe("unavailable");

    const tampered = `${token.slice(0, 63)}${token.endsWith("0") ? "1" : "0"}`;
    expect((await reader().invoke({ token: tampered })).status).toBe("unavailable");
    const foreignSigned = reader({ secret: "another-installation-secret-0123456789" });
    expect((await foreignSigned.invoke({ token })).status).toBe("unavailable");

    const limited = reader({ perLink: 2 });
    expect((await limited.invoke({ token })).status).toBe("available");
    expect((await limited.invoke({ token })).status).toBe("available");
    expect(await limited.invoke({ token })).toMatchObject({ status: "rateLimited" });

    const off = await w.as(w.admin, () => di.getSetPublicLinksAllowedInteractor().invoke({ allowPublicLinks: false }));
    expect(off).toEqual({ ok: true, data: { allowPublicLinks: false, activeLinkCount: 2 } });
    expect((await reader().invoke({ token })).status).toBe("unavailable");
    expect((await reader().invoke({ token: memberToken })).status).toBe("unavailable");
    expect(
      await w.as(publisher, () => di.getManagePublicLinkInteractor().invoke({ action: "read", viewId: memberBoard })),
    ).toMatchObject({ ok: true, data: { allowed: false, reason: "workspaceDisabled" } });
    expect((await publish(w, publisher, memberBoard)).status).toBe(403);
    await expect(
      w.as(w.member, () => di.getSetPublicLinksAllowedInteractor().invoke({ allowPublicLinks: true })),
    ).rejects.toThrow("update on company");
    await w.as(w.admin, () => di.getSetPublicLinksAllowedInteractor().invoke({ allowPublicLinks: true }));
    expect((await reader().invoke({ token })).status).toBe("available");

    await runWithoutTenant(() => prisma.rolePermission.delete({ where: { id: permission.id } }));
    expect((await reader().invoke({ token: memberToken })).status).toBe("unavailable");
    await runWithoutTenant(() =>
      prisma.rolePermission.create({
        data: { roleId: w.member.roleId as string, companyId: w.companyId, resource: "publicLinks", action: "create" },
      }),
    );
    expect((await reader().invoke({ token: memberToken })).status).toBe("available");
    await runWithoutTenant(() => prisma.user.update({ where: { id: w.member.id }, data: { status: "inactive" } }));
    expect((await reader().invoke({ token: memberToken })).status).toBe("unavailable");

    const revoked = await postAs(w, w.admin, routes.publish, {
      surfaceKey: "dashboard",
      viewKey: adminBoard,
      public: false,
    });
    expect(revoked).toMatchObject({ status: 200, body: { action: "publish", publicLink: null } });
    expect((await reader().invoke({ token })).status).toBe("unavailable");
    expect((await records().invoke({ token, widget: 0, group: null, label: null })).status).toBe("unavailable");
    const again = await publish(w, w.admin, adminBoard);
    const newToken = tokenOf(again.body.publicLink.url as string);
    expect(newToken).not.toBe(token);
    expect((await reader().invoke({ token })).status).toBe("unavailable");
    expect((await reader().invoke({ token: newToken })).status).toBe("available");

    const trashed = await postAs(w, w.admin, routes.removeView, {
      surfaceKey: "dashboard",
      viewKey: adminBoard,
      name: "Investor board",
    });
    expect(trashed.status).toBe(200);
    expect((await reader().invoke({ token: newToken })).status).toBe("unavailable");

    const events = await runWithoutTenant(() =>
      prisma.eventLog.findMany({
        where: { companyId: w.companyId, kind: { startsWith: "public_link." } },
        select: { kind: true, actorId: true },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(events.map(({ kind }) => kind)).toEqual([
      "public_link.created",
      "public_link.created",
      "public_link.revoked",
      "public_link.created",
    ]);
    expect(publicLinkToken(counted.id, SECRET)).toBe(token);
  }, 300_000);

  it("publishes a list view by link with only its visible columns, its saved search and the creator's access", async () => {
    const w = await workspace();
    await w.grant("deal", ["readOwn", "create"]);
    const assigned = await w.create("deal", "deal.name", "Budget for Pia", w.member);
    const north = await w.create("deal", "deal.name", "Owner budget north");
    const south = await w.create("deal", "deal.name", "Owner budget south");
    await w.create("deal", "deal.name", "Unrelated renewal");
    const surfaceKey = `records:${w.id("deal")}`;
    const stage = w.id("deal.stage");
    const created = await postAs(w, w.admin, routes.createView, {
      surfaceKey,
      name: "Budget deals",
      state: { searchTerm: "budget", hiddenColumns: [stage, "system:assignedTo"] },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const viewKey = created.body.viewKey as string;

    const published = await postAs(w, w.admin, routes.publish, { surfaceKey, viewKey, public: true });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const token = tokenOf(published.body.publicLink.url as string);

    const open = await reader().invoke({ token, visitor: "visitor-list" });
    if (open.status !== "available" || !("list" in open)) throw new Error("list not available");
    expect(open.list).toMatchObject({ name: "Budget deals", expiresAt: null });
    const page = open.list.presentation;
    expect(page.result.items.map((row) => row.ref.recordId).sort()).toEqual(
      [assigned.recordId, north.recordId, south.recordId].sort(),
    );
    expect(page.result.pagination?.total).toBe(3);
    expect(page.model.fields.map((field) => field.id)).not.toContain(stage);
    for (const row of page.result.items) {
      expect(row.fields.map((field) => field.fieldId)).not.toContain(stage);
      expect(row.assignedUserIds).toEqual([]);
      expect(row.assignedUsers).toEqual([]);
    }
    expect(page).toMatchObject({ permittedActions: [], canManageSchema: false });
    expect(page.result).toMatchObject({ views: [], filters: [], searchTerm: "", filterableFields: [] });
    const serialized = JSON.stringify(open.list);
    for (const secret of [w.admin.id, w.member.id, viewKey, "Unrelated renewal"])
      expect(serialized).not.toContain(secret);

    const newestFirst = await listRecords().invoke({
      token,
      sortDescriptor: { field: "system:createdAt", direction: "desc" },
    });
    expect(
      newestFirst.status === "available" && newestFirst.presentation.result.items.map((row) => row.ref.recordId),
    ).toEqual([south.recordId, north.recordId, assigned.recordId]);
    const paged = await listRecords().invoke({
      token,
      page: 2,
      pageSize: 5,
      sortDescriptor: { field: "system:createdAt", direction: "asc" },
    });
    expect(paged.status === "available" && paged.presentation.result.items).toEqual([]);
    const hiddenSort = await listRecords().invoke({ token, sortDescriptor: { field: stage, direction: "asc" } });
    expect(hiddenSort.status).toBe("available");
    expect(hiddenSort.status === "available" && hiddenSort.presentation.result.sortDescriptor?.field).not.toBe(stage);
    expect(hiddenSort.status === "available" && JSON.stringify(hiddenSort.presentation)).not.toContain(stage);
    expect((await listRecords().invoke({ token, pageSize: 7 })).status).toBe("unavailable");

    expect((await records().invoke({ token, widget: 0, group: null, label: null })).status).toBe("unavailable");
    const adminBoard = await board(w, w.admin, "Board");
    const boardLink = await publish(w, w.admin, adminBoard);
    expect((await listRecords().invoke({ token: tokenOf(boardLink.body.publicLink.url as string) })).status).toBe(
      "unavailable",
    );

    const usersView = await postAs(w, w.admin, routes.createView, {
      surfaceKey: "users-card-store",
      name: "People",
      state: {},
    });
    if (usersView.status === 200) {
      expect(
        (
          await postAs(w, w.admin, routes.publish, {
            surfaceKey: "users-card-store",
            viewKey: usersView.body.viewKey,
            public: true,
          })
        ).status,
      ).toBe(400);
    }

    await runWithoutTenant(() =>
      prisma.rolePermission.create({
        data: { roleId: w.member.roleId as string, companyId: w.companyId, resource: "publicLinks", action: "create" },
      }),
    );
    const publisher = createMockUser({
      ...w.member,
      role: {
        ...(w.member.role as NonNullable<TenantUser["role"]>),
        permissions: [{ resource: "publicLinks", action: "create" }],
      },
    } as never);
    const memberView = await postAs(w, publisher, routes.createView, { surfaceKey, name: "My deals", state: {} });
    expect(memberView.status, JSON.stringify(memberView.body)).toBe(200);
    expect((await postAs(w, w.member, routes.publish, { surfaceKey, viewKey, public: true })).status).toBe(404);
    const memberLink = await postAs(w, publisher, routes.publish, {
      surfaceKey,
      viewKey: memberView.body.viewKey,
      public: true,
    });
    expect(memberLink.status, JSON.stringify(memberLink.body)).toBe(200);
    const memberOpen = await reader().invoke({ token: tokenOf(memberLink.body.publicLink.url as string) });
    expect(
      memberOpen.status === "available" &&
        "list" in memberOpen &&
        memberOpen.list.presentation.result.items.map((row) => row.ref.recordId),
    ).toEqual([assigned.recordId]);

    await postAs(w, w.admin, routes.publish, { surfaceKey, viewKey, public: false });
    expect((await reader().invoke({ token })).status).toBe("unavailable");
    expect((await listRecords().invoke({ token })).status).toBe("unavailable");
  }, 300_000);
});
