import type { RestRouteWorkspace } from "@/tests/helpers/rest-route-workspace";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
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
  save: (await import("@/app/api/v1/widgets/save/route")).POST,
  list: (await import("@/app/api/v1/widgets/list/route")).POST,
  remove: (await import("@/app/api/v1/widgets/delete/route")).POST,
  layout: (await import("@/app/api/v1/widgets/layout/route")).POST,
  createView: (await import("@/app/api/v1/data-views/create/route")).POST,
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

async function saveWidget(w: RestRouteWorkspace, user: TenantUser, name: string, viewId: string | null) {
  const result = await postAs(w, user, routes.save, {
    expectedRevision: await w.revision(),
    idempotencyKey: randomUUID(),
    name,
    measure: { source: { typeId: w.id("service") }, aggregation: "count", valueFieldId: null, groupBy: null },
    displayOptions: { displayType: "number" },
    isTemplate: false,
    viewId,
  });
  if (result.status !== 200) throw new Error(JSON.stringify(result.body));
  return result.body.id as string;
}

const listed = async (w: RestRouteWorkspace, user: TenantUser) => {
  const result = await postAs(w, user, routes.list, {});
  expect(result.status).toBe(200);
  return result.body.widgets as Array<{
    id: string;
    viewId: string | null;
    version: number;
    layout: Record<string, { x: number; y: number; w: number; h: number }> | null;
  }>;
};

const everywhere = (i: string, lg: { x: number; y: number; w: number; h: number }) => ({
  xs: [{ i, x: 0, y: lg.y, w: 2, h: lg.h }],
  sm: [{ i, x: 0, y: lg.y, w: 4, h: lg.h }],
  md: [{ i, x: 0, y: lg.y, w: 8, h: lg.h }],
  lg: [{ i, ...lg }],
});

describeDatabase("widget REST routes on PostgreSQL", () => {
  it("lists widgets of every dashboard view, re-lays them out in one batch and deletes one to Trash", async () => {
    const w = await workspace();
    const view = await postAs(w, w.admin, routes.createView, { surfaceKey: "dashboard", name: "Berlin", state: {} });
    const viewId = view.body.viewKey as string;
    const main = await saveWidget(w, w.admin, "Main", null);
    const berlin = await saveWidget(w, w.admin, "Berlin", viewId);

    const widgets = await listed(w, w.admin);
    expect(widgets.map(({ id, viewId: owner }) => ({ id, viewId: owner }))).toEqual([
      { id: main, viewId: null },
      { id: berlin, viewId },
    ]);
    expect(widgets.every((widget) => widget.layout?.lg)).toBe(true);

    const moved = await postAs(w, w.admin, routes.layout, {
      layouts: {
        xs: [...everywhere(main, { x: 0, y: 4, w: 6, h: 2 }).xs, ...everywhere(berlin, { x: 0, y: 0, w: 6, h: 3 }).xs],
        sm: [...everywhere(main, { x: 0, y: 4, w: 6, h: 2 }).sm, ...everywhere(berlin, { x: 0, y: 0, w: 6, h: 3 }).sm],
        md: [...everywhere(main, { x: 0, y: 4, w: 6, h: 2 }).md, ...everywhere(berlin, { x: 0, y: 0, w: 6, h: 3 }).md],
        lg: [
          { i: main, x: 6, y: 4, w: 6, h: 2 },
          { i: berlin, x: 0, y: 0, w: 6, h: 3 },
        ],
      },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.map((saved: { id: string }) => saved.id).sort()).toEqual([main, berlin].sort());
    const after = await listed(w, w.admin);
    expect(after.find((widget) => widget.id === main)?.layout).toMatchObject({
      lg: { x: 6, y: 4, w: 6, h: 2 },
      md: { x: 0, y: 4, w: 8, h: 2 },
    });

    const overflowing = await postAs(w, w.admin, routes.layout, {
      layouts: { xs: [], sm: [], md: [], lg: [{ i: main, x: 8, y: 0, w: 6, h: 2 }] },
    });
    expect(overflowing).toMatchObject({ status: 400, body: { error: { kind: "validation" } } });

    const removed = await postAs(w, w.admin, routes.remove, { id: berlin });
    expect(removed).toMatchObject({ status: 200, body: { id: berlin, trashBatchId: expect.any(String) } });
    expect((await listed(w, w.admin)).map(({ id }) => id)).toEqual([main]);
  }, 180_000);

  it("never lists, moves or deletes another member's or another workspace's widget", async () => {
    const w = await workspace();
    const other = await workspace();
    const owned = await saveWidget(w, w.admin, "Owner only", null);
    const before = (await listed(w, w.admin))[0];

    for (const [tenant, user] of [
      [w, w.member],
      [other, other.admin],
    ] as const) {
      expect(await listed(tenant, user)).toEqual([]);
      const removed = await postAs(tenant, user, routes.remove, { id: owned });
      expect(removed.status).toBe(404);
      expect(removed.body.error.kind).toBe("not_found");
      const moved = await postAs(tenant, user, routes.layout, {
        layouts: everywhere(owned, { x: 6, y: 9, w: 6, h: 2 }),
      });
      expect(moved).toEqual({ status: 200, body: [] });
    }

    expect(await listed(w, w.admin)).toEqual([
      expect.objectContaining({ id: owned, version: before.version, layout: before.layout }),
    ]);
  }, 180_000);
});
