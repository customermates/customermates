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

function reader(options: { now?: Date; perLink?: number } = {}) {
  return new ReadPublicLinkInteractor(
    new PrismaPublicLinkRepo(),
    new PrismaPublicLinkRepo(),
    new PublicLinkTenant(di.getUserService()),
    { invoke: (data) => di.getGetWidgetsInteractor().invoke(data) },
    new PublicLinkRateLimiter(options.perLink ?? 1000, 60_000),
    new PublicLinkRateLimiter(1000, 60_000),
    { authSecret: SECRET, cacheMs: 0, ...(options.now ? { now: () => options.now as Date } : {}) },
  );
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
  result.status === "available" ? result.dashboard.widgets[0]?.data?.total.count : result.status;

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
    if (open.status !== "available") throw new Error("not available");
    expect(open.dashboard).toMatchObject({ name: "Investor board", expiresAt: null, hiddenWidgetCount: 0 });
    expect(open.dashboard.widgets.map((widget) => widget.name)).toEqual(["Deals", "Deals by stage"]);
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

    expect((await publish(w, w.admin, adminBoard, { expiresAt: "2001-01-01" })).status).toBe(400);
    const withEnd = await publish(w, w.admin, adminBoard, { expiresAt: "2099-12-31" });
    expect(withEnd.body.publicLink).toMatchObject({ url, expiresAt: "2099-12-31" });
    expect((await reader({ now: new Date("2099-12-31T23:00:00Z") }).invoke({ token })).status).toBe("available");
    expect((await reader({ now: new Date("2100-01-01T00:00:01Z") }).invoke({ token })).status).toBe("unavailable");

    const tampered = `${token.slice(0, 63)}${token.endsWith("0") ? "1" : "0"}`;
    expect((await reader().invoke({ token: tampered })).status).toBe("unavailable");
    const foreignSigned = new ReadPublicLinkInteractor(
      new PrismaPublicLinkRepo(),
      new PrismaPublicLinkRepo(),
      new PublicLinkTenant(di.getUserService()),
      { invoke: (data) => di.getGetWidgetsInteractor().invoke(data) },
      new PublicLinkRateLimiter(),
      new PublicLinkRateLimiter(),
      { authSecret: "another-installation-secret-0123456789", cacheMs: 0 },
    );
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
});
