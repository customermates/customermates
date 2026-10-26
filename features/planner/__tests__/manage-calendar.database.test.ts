import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
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

const { getManageCalendarInteractor, getGetPlannerOptionsInteractor, getGetRecordModelInteractor } = await import(
  "@/core/di"
);
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const apply = await restRoute("/v1/model/apply");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

type Input = Parameters<ReturnType<typeof getManageCalendarInteractor>["invoke"]>[0];

function failure(outcome: {
  ok: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; params?: Record<string, unknown> }> };
}) {
  if (outcome.ok) throw new Error("Expected a failure");
  const [issue] = outcome.error?.issues ?? [];
  return { error: issue?.params?.error, path: issue?.path };
}

async function workspaceWithDueDate() {
  const workspace = await createRestRouteWorkspace();
  cleanups.push(workspace.cleanup);
  const field = {
    id: randomUUID(),
    typeId: workspace.id("deal"),
    label: "Due on",
    valueType: "date",
    behavior: { kind: "input" },
    required: false,
    archived: false,
    options: [],
    position: 500,
  };
  const applied = await postAs(workspace, workspace.admin, apply, {
    expectedRevision: await workspace.revision(),
    idempotencyKey: randomUUID(),
    operations: [{ operation: "putField", field }],
  });
  if (applied.status !== 200) throw new Error(JSON.stringify(applied.body));
  return workspace;
}

describeDatabase("manage calendar", { timeout: 60000 }, () => {
  afterAll(async () => {
    for (const cleanup of cleanups) await cleanup();
  });

  it("reads the derived default, validates and saves updates, and resets to the default", async () => {
    const workspace = await workspaceWithDueDate();
    const manage = async (input: Input) =>
      workspace.as(workspace.admin, () => getManageCalendarInteractor().invoke(input));
    const ok = async (input: Input) => {
      const outcome = await manage(input);
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
      return outcome.data;
    };

    const options = await ok({ action: "options" });
    const [list] = options.lists ?? [];
    expect(list.dateFields.length).toBeGreaterThan(0);
    expect(options).toMatchObject({ personalAvailable: false, calendars: [] });

    const initial = await ok({ action: "read" });
    expect(initial.saved).toBe(false);
    expect(initial.config?.timeZone).toBe("UTC");
    expect(initial.config?.sources.map((source) => source.typeId)).toEqual(options.lists?.map((item) => item.typeId));
    expect(initial.config?.sources[0]).toMatchObject({
      id: list.dateFields[0].id,
      typeId: list.typeId,
      calendar: { dateFieldId: list.dateFields[0].id },
      filters: [],
      enabled: true,
    });

    const updated = await ok({
      action: "update",
      sources: [
        {
          typeId: list.typeId,
          calendar: { dateFieldId: list.dateFields[0].id },
          filters: [],
          enabled: true,
          color: "success",
        },
      ],
      timeZone: "Europe/Berlin",
    });
    expect(updated.saved).toBe(true);
    expect(updated.config).toMatchObject({ timeZone: "Europe/Berlin", mode: "month", calendarIds: [] });
    expect(updated.config?.sources).toHaveLength(1);
    const sourceId = updated.config?.sources[0].id;

    const week = await ok({ action: "update", mode: "week" });
    expect(week.config).toMatchObject({ mode: "week", timeZone: "Europe/Berlin", sources: [{ id: sourceId }] });
    const page = await workspace.as(workspace.admin, () => getGetPlannerOptionsInteractor().invoke());
    expect(page.ok && page.data).toMatchObject({ saved: true, config: week.config });

    const source = {
      typeId: list.typeId,
      calendar: { dateFieldId: list.dateFields[0].id },
      filters: [],
      enabled: true,
      color: "default" as const,
    };
    expect(failure(await manage({ action: "update", sources: [{ ...source, typeId: randomUUID() }] }))).toEqual({
      error: "recordTypeNotFound",
      path: ["sources", 0, "typeId"],
    });
    expect(
      failure(await manage({ action: "update", sources: [{ ...source, calendar: { dateFieldId: randomUUID() } }] })),
    ).toEqual({ error: "invalidFilterField", path: ["sources", 0, "calendar", "dateFieldId"] });
    expect(
      failure(
        await manage({
          action: "update",
          sources: [source, { ...source, filters: [{ field: randomUUID(), operator: FilterOperatorKey.isNull }] }],
        }),
      ),
    ).toEqual({ error: "invalidFilterField", path: ["sources", 1, "filters", 0] });
    expect(failure(await manage({ action: "update", calendarIds: [randomUUID()] }))).toEqual({
      error: "calendarNotFound",
      path: ["calendarIds", 0],
    });
    expect((await ok({ action: "read" })).config).toEqual(week.config);

    const reset = await ok({ action: "reset" });
    expect(reset).toMatchObject({ saved: false, config: initial.config });

    expect(await ok({ action: "subscriptions" })).toEqual({ action: "subscriptions", subscriptions: [] });
    expect(failure(await manage({ action: "revoke", subscriptionId: randomUUID() }))).toEqual({
      error: "calendarSubscriptionNotFound",
      path: ["subscriptionId"],
    });
  });

  it("keeps the configuration personal and leaves out lists a schema manager cannot read", async () => {
    const workspace = await workspaceWithDueDate();
    const options = await workspace.as(workspace.admin, () =>
      getManageCalendarInteractor().invoke({ action: "options" }),
    );
    if (!options.ok) throw new Error("options failed");
    const [list] = options.data.lists ?? [];
    const saved = await workspace.as(workspace.admin, () =>
      getManageCalendarInteractor().invoke({ action: "update", mode: "agenda" }),
    );
    expect(saved.ok && saved.data.saved).toBe(true);

    const { prisma } = await import("@/prisma/db");
    const roleId = workspace.member.roleId;
    if (!roleId) throw new Error("The member has no role");
    const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
    await runWithoutTenant(() =>
      prisma.rolePermission.create({
        data: {
          companyId: workspace.companyId,
          roleId,
          resource: "dataModel",
          action: "update",
        },
      }),
    );
    const model = await workspace.as(workspace.member, () => getGetRecordModelInteractor().invoke({}));
    expect(model.ok && model.data.types.map((type) => type.id)).toContain(list.typeId);
    const member = await workspace.as(workspace.member, () => getManageCalendarInteractor().invoke({ action: "read" }));
    expect(member.ok && member.data).toMatchObject({ saved: false, config: { mode: "month", sources: [] } });
    const memberOptions = await workspace.as(workspace.member, () =>
      getManageCalendarInteractor().invoke({ action: "options" }),
    );
    expect(memberOptions.ok && memberOptions.data.lists).toEqual([]);
    expect(
      failure(
        await workspace.as(workspace.member, () =>
          getManageCalendarInteractor().invoke({
            action: "update",
            sources: [
              {
                typeId: list.typeId,
                calendar: { dateFieldId: list.dateFields[0].id },
                filters: [],
                enabled: true,
                color: "default",
              },
            ],
          }),
        ),
      ),
    ).toEqual({ error: "recordTypeNotFound", path: ["sources", 0, "typeId"] });
  });
});
