import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const mode = vi.hoisted(() => ({ app: "self-hosted" as "self-hosted" | "cloud" }));

vi.mock("@/env", () => ({
  env: {
    get APP_MODE() {
      return mode.app;
    },
    BASE_URL: "http://127.0.0.1:4000",
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
const { SubscriptionPlan, SubscriptionStatus } = await import("@/generated/prisma");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  mode.app = "self-hosted";
  for (const cleanup of cleanups) await cleanup();
});

const DAY = 24 * 60 * 60 * 1000;
const subscriptions = {
  trial: {
    status: SubscriptionStatus.trial,
    plan: SubscriptionPlan.pro,
    trialEndDate: new Date(Date.now() + 14 * DAY),
  },
  active: { status: SubscriptionStatus.active, plan: SubscriptionPlan.business, trialEndDate: null },
  expired: { status: SubscriptionStatus.trial, plan: SubscriptionPlan.pro, trialEndDate: new Date(Date.now() - DAY) },
};

async function workspace(app: "self-hosted" | "cloud", subscription: keyof typeof subscriptions | null) {
  mode.app = app;
  const w = await createRestRouteWorkspace();
  cleanups.push(w.cleanup);
  if (subscription) {
    await runWithoutTenant(() =>
      prisma.subscription.create({ data: { companyId: w.companyId, ...subscriptions[subscription] } }),
    );
  }
  const call = async (path: string, body: unknown) => {
    const result = await postAs(w, w.admin, await restRoute(path), body);
    expect(result.status, `${path} ${JSON.stringify(body)}: ${JSON.stringify(result.body)}`).toBe(200);
    return result.body;
  };
  const saveTimeline = async () =>
    call("/v1/widgets/save", {
      kind: "activityTimeline",
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      name: "Recent changes",
      activityQuery: { scope: {}, kinds: ["record", "audit", "configuration"] },
      displayOptions: { showFilters: true },
    });
  return { w, call, saveTimeline };
}

describeDatabase("public REST responses match public/v1/openapi.json", () => {
  it.each([
    ["self-hosted", null],
    ["cloud", "trial"],
  ] as const)(
    "answers every search, list and read operation in %s mode (%s subscription)",
    async (app, plan) => {
      const { w, call, saveTimeline } = await workspace(app, plan);

      const deal = await w.create("deal", "deal.name", "Conformance deal");
      const removed = await w.create("deal", "deal.name", "Conformance trashed deal");
      await w.remove(removed);

      await call("/v1/model/apply", {
        expectedRevision: await w.revision(),
        idempotencyKey: randomUUID(),
        operations: [
          {
            operation: "createType",
            reference: "$projects",
            label: "Project",
            pluralLabel: "Projects",
            description: "Conformance list",
            icon: "folder",
            embedded: false,
            accessPresetId: null,
          },
        ],
      });
      const page = await call("/v1/wiki/create", { pages: [{ title: "Conformance facts", markdown: "Some facts." }] });
      await call("/v1/data-views/create", { surfaceKey: "dashboard", name: "Conformance", state: {} });
      const chart = await call("/v1/widgets/save", {
        expectedRevision: await w.revision(),
        idempotencyKey: randomUUID(),
        name: "Deals",
        measure: { source: { typeId: w.id("deal") }, aggregation: "count", valueFieldId: null, groupBy: null },
        displayOptions: { displayType: "number" },
        isTemplate: false,
        viewId: null,
      });

      const timeline = await saveTimeline();

      const activities = await call("/v1/records/activities", {
        scope: {},
        kinds: ["record", "audit", "configuration"],
        limit: 50,
      });
      expect(activities.items.some((item: { kind: string }) => item.kind === "configuration")).toBe(true);
      await call("/v1/records/activities", { scope: { records: [deal] }, limit: 5 });
      const widgets = await call("/v1/widgets/list", {});
      expect(widgets.widgets.map((widget: { id: string }) => widget.id)).toEqual(
        expect.arrayContaining([chart.id, timeline.id]),
      );
      await call("/v1/widgets/read", { id: chart.id });
      await call("/v1/widgets/read", { id: timeline.id });

      const users = await call("/v1/users/search", { pagination: { page: 1, pageSize: 5 } });
      expect(users.items.length).toBeGreaterThan(0);
      const nobody = await call("/v1/users/search", {
        searchTerm: "no member matches this search",
        pagination: { page: 1, pageSize: 5 },
      });
      expect(nobody).toMatchObject({ items: [], pagination: { total: 0, totalPages: 1 } });
      await call("/v1/records/search", { searchTerm: "Conformance", typeIds: [deal.typeId], limit: 3 });
      await call("/v1/records/query", { typeId: deal.typeId, pageSize: 5 });
      await call("/v1/records/read", deal);
      await call("/v1/records/detail-layout/read", { typeId: deal.typeId });
      await call("/v1/records/identities/resolve", {
        identifiers: [{ provider: "mail", value: "nobody@example.test" }],
      });
      await call("/v1/reports/query", {
        source: { typeId: deal.typeId },
        aggregation: "count",
        valueFieldId: null,
        groupBy: null,
      });
      await call("/v1/model/discover", {});
      await call("/v1/model/read", { typeIds: [deal.typeId] });
      await call("/v1/roles/read", {});
      await call("/v1/routines/list", {});
      await call("/v1/wiki/list", { page: 1, pageSize: 25 });
      await call("/v1/wiki/search", { query: "facts" });
      await call("/v1/wiki/read", { id: page[0].id });
      await call("/v1/data-views/surfaces", {});
      await call("/v1/data-views/list", { surfaceKey: `records:${deal.typeId}`, page: 1, pageSize: 25 });
      await call("/v1/trash/query", { kinds: ["record"], typeIds: [deal.typeId], page: 1, pageSize: 10 });
      await call("/v1/trash/read", removed);
    },
    60_000,
  );

  it.each(["active", "expired", null] as const)(
    "reads activities and saves a timeline widget in cloud mode (%s subscription)",
    async (plan) => {
      const { w, call, saveTimeline } = await workspace("cloud", plan);
      await w.create("deal", "deal.name", "Cloud deal");
      const timeline = await saveTimeline();
      const activities = await call("/v1/records/activities", { scope: {}, limit: 10 });
      expect(activities.items.length).toBeGreaterThan(0);
      const widgets = await call("/v1/widgets/list", {});
      expect(widgets.widgets.map((widget: { id: string }) => widget.id)).toContain(timeline.id);
    },
    60_000,
  );
});
