import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { createRestRouteWorkspace, postAs } = await import("@/tests/helpers/rest-route-workspace");
const routes = {
  surfaces: (await import("@/app/api/v1/data-views/surfaces/route")).POST,
  config: (await import("@/app/api/v1/data-views/config/route")).POST,
  list: (await import("@/app/api/v1/data-views/list/route")).POST,
  read: (await import("@/app/api/v1/data-views/read/route")).POST,
  create: (await import("@/app/api/v1/data-views/create/route")).POST,
  update: (await import("@/app/api/v1/data-views/update/route")).POST,
  select: (await import("@/app/api/v1/data-views/select/route")).POST,
  reset: (await import("@/app/api/v1/data-views/reset/route")).POST,
  remove: (await import("@/app/api/v1/data-views/delete/route")).POST,
};

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("saved view REST routes on PostgreSQL", () => {
  it("creates, reads, updates, selects, resets and deletes list and dashboard views", async () => {
    const w = await workspace();
    const surfaceKey = `records:${w.id("deal")}`;
    const call = (route: keyof typeof routes, body: unknown) => postAs(w, w.admin, routes[route], body);

    const surfaces = await call("surfaces", {});
    expect(surfaces.status, JSON.stringify(surfaces.body)).toBe(200);
    expect(surfaces.body.items.map((item: { surfaceKey: string }) => item.surfaceKey)).toEqual(
      expect.arrayContaining(["dashboard", "users-card-store", surfaceKey]),
    );
    const config = await call("config", { surfaceKey, section: "overview" });
    expect(config).toMatchObject({ status: 200, body: { action: "config", section: "overview" } });

    const created = await call("create", { surfaceKey, name: "Large deals", state: { pageSize: 25 } });
    expect(created).toMatchObject({ status: 200, body: { action: "create", selected: true, state: { pageSize: 25 } } });
    const viewKey = created.body.viewKey as string;

    const listed = await call("list", { surfaceKey });
    expect(listed.body).toMatchObject({
      total: 1,
      activeViewKey: viewKey,
      items: [{ id: viewKey, name: "Large deals" }],
    });
    expect(listed.body.items[0]).not.toHaveProperty("state");

    const updated = await call("update", { surfaceKey, viewKey, name: "Big deals", state: { viewMode: "table" } });
    expect(updated).toMatchObject({ status: 200, body: { action: "update", viewKey, name: "Big deals" } });
    expect(await call("read", { surfaceKey, viewKey })).toMatchObject({
      status: 200,
      body: { action: "read", items: [{ id: viewKey, name: "Big deals", state: { pageSize: 25, viewMode: "table" } }] },
    });
    expect((await call("read", { surfaceKey })).status).toBe(400);

    expect(await call("reset", { surfaceKey, viewKey, fields: ["pageSize"] })).toMatchObject({
      status: 200,
      body: { action: "reset", viewKey },
    });
    const reset = await call("read", { surfaceKey, viewKey });
    expect(reset.body.items[0].state).not.toHaveProperty("pageSize");

    const dashboard = await call("create", { surfaceKey: "dashboard", name: "Berlin", state: {} });
    expect(dashboard.status).toBe(200);
    expect(await call("select", { surfaceKey: "dashboard", viewKey: "__all__" })).toMatchObject({
      status: 200,
      body: { selected: true },
    });
    const removed = await call("remove", { surfaceKey: "dashboard", viewKey: dashboard.body.viewKey });
    expect(removed).toMatchObject({ status: 200, body: { deleted: true, trashBatchId: expect.any(String) } });
    expect((await call("list", { surfaceKey: "dashboard" })).body.total).toBe(0);
  }, 180_000);

  it("denies surfaces the caller's role cannot read", async () => {
    const w = await workspace();
    const surfaceKey = `records:${w.id("deal")}`;
    const asMember = (route: keyof typeof routes, body: unknown) => postAs(w, w.member, routes[route], body);

    const surfaces = await asMember("surfaces", {});
    const keys = surfaces.body.items.map((item: { surfaceKey: string }) => item.surfaceKey);
    expect(keys).toContain("dashboard");
    expect(keys).not.toContain("users-card-store");
    expect(keys).not.toContain(surfaceKey);

    for (const denied of [
      await asMember("list", { surfaceKey: "users-card-store" }),
      await asMember("create", { surfaceKey, name: "Not allowed", state: {} }),
    ]) {
      expect(denied.status, JSON.stringify(denied.body)).toBe(403);
      expect(denied.body.error.kind).toBe("authorization");
    }

    await w.grant("deal", ["readAll"]);
    expect((await asMember("create", { surfaceKey, name: "Allowed", state: {} })).status).toBe(200);
  }, 180_000);

  it("keeps views private to their owner and their workspace", async () => {
    const w = await workspace();
    const other = await workspace();
    const created = await postAs(w, w.admin, routes.create, { surfaceKey: "dashboard", name: "Private", state: {} });
    const viewKey = created.body.viewKey as string;

    for (const [tenant, user] of [
      [w, w.member],
      [other, other.admin],
    ] as const) {
      expect((await postAs(tenant, user, routes.list, { surfaceKey: "dashboard" })).body.total).toBe(0);
      for (const [route, body] of [
        [routes.read, { surfaceKey: "dashboard", viewKey }],
        [routes.update, { surfaceKey: "dashboard", viewKey, name: "Taken" }],
        [routes.select, { surfaceKey: "dashboard", viewKey }],
        [routes.remove, { surfaceKey: "dashboard", viewKey }],
      ] as const) {
        const result = await postAs(tenant, user, route, body);
        expect(result.status).toBe(404);
        expect(result.body.error.kind).toBe("not_found");
      }
    }
    expect(await postAs(w, w.admin, routes.read, { surfaceKey: "dashboard", viewKey })).toMatchObject({
      status: 200,
      body: { items: [{ id: viewKey, name: "Private" }] },
    });
  }, 180_000);
});
