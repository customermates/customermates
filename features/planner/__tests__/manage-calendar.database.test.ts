import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
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

const { getGetPlannerOptionsInteractor, getManageCalendarSubscriptionsInteractor, getReadPlannerInteractor } =
  await import("@/core/di");
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");
const { manageCalendarTool } = await import("@/features/mcp-tools/planner.mcp-tools");
const { ManageCalendarResultSchema } = await import("../manage-calendar.schema");
const apply = await restRoute("/v1/model/apply");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

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

function calendarTool(workspace: Workspace, user: TenantUser = workspace.admin) {
  const call = (input: Record<string, unknown>) =>
    workspace.as(user, () => executeMcpTool(manageCalendarTool, [input]));
  return {
    ok: async (input: Record<string, unknown>) => {
      const outcome = await call(input);
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.failure));
      return ManageCalendarResultSchema.parse(outcome.structuredContent);
    },
    failure: async (input: Record<string, unknown>) => {
      const outcome = await call(input);
      if (outcome.ok) throw new Error("Expected a failure");
      const [issue] = outcome.failure?.issues ?? [];
      return { kind: outcome.failure?.kind, error: issue?.customCode, path: issue?.path };
    },
  };
}

describeDatabase("manage_calendar", { timeout: 60000 }, () => {
  afterAll(async () => {
    for (const cleanup of cleanups) await cleanup();
  });

  it("reads the derived default, validates and saves updates, and resets to the default", async () => {
    const workspace = await workspaceWithDueDate();
    const tool = calendarTool(workspace);

    const options = await tool.ok({ action: "options" });
    const [list] = options.lists ?? [];
    expect(list.dateFields.length).toBeGreaterThan(0);
    expect(options).toMatchObject({ personalAvailable: false, calendars: [] });

    const initial = await tool.ok({ action: "read" });
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

    const source = { typeId: list.typeId, calendar: { dateFieldId: list.dateFields[0].id } };
    const updated = await tool.ok({
      action: "update",
      config: { sources: [{ ...source, color: "success" }], timeZone: "Europe/Berlin" },
    });
    expect(updated).toMatchObject({
      action: "update",
      saved: true,
      config: { timeZone: "Europe/Berlin", mode: "month", calendarIds: [] },
    });
    expect(updated.config?.sources).toEqual([
      { ...source, id: expect.any(String), filters: [], enabled: true, color: "success" },
    ]);
    const sourceId = updated.config?.sources[0].id;

    const week = await tool.ok({ action: "update", config: { mode: "week" } });
    expect(week.config).toMatchObject({ mode: "week", timeZone: "Europe/Berlin", sources: [{ id: sourceId }] });
    const page = await workspace.as(workspace.admin, () => getGetPlannerOptionsInteractor().invoke());
    expect(page.ok && page.data).toMatchObject({ saved: true, config: week.config });

    expect(
      await tool.failure({ action: "update", config: { sources: [{ ...source, typeId: randomUUID() }] } }),
    ).toEqual({ kind: "not_found", error: "recordTypeNotFound", path: ["config", "sources", 0, "typeId"] });
    expect(
      await tool.failure({
        action: "update",
        config: { sources: [{ ...source, calendar: { dateFieldId: randomUUID() } }] },
      }),
    ).toEqual({
      kind: "validation",
      error: "invalidFilterField",
      path: ["config", "sources", 0, "calendar", "dateFieldId"],
    });
    expect(
      await tool.failure({
        action: "update",
        config: {
          sources: [source, { ...source, filters: [{ field: randomUUID(), operator: FilterOperatorKey.isNull }] }],
        },
      }),
    ).toEqual({ kind: "validation", error: "invalidFilterField", path: ["config", "sources", 1, "filters", 0] });
    expect(await tool.failure({ action: "update", config: { calendarIds: [randomUUID()] } })).toEqual({
      kind: "not_found",
      error: "calendarNotFound",
      path: ["config", "calendarIds", 0],
    });
    expect(
      await tool.failure({
        action: "update",
        config: {
          sources: [
            { ...source, id: sourceId },
            { ...source, id: sourceId },
          ],
        },
      }),
    ).toMatchObject({ kind: "validation", path: ["settings"] });
    expect(await tool.failure({ action: "update" })).toMatchObject({ kind: "validation", path: ["config"] });
    expect(await tool.failure({ action: "read", config: { mode: "week" } })).toMatchObject({
      kind: "validation",
      path: ["config"],
    });
    expect((await tool.ok({ action: "read" })).config).toEqual(week.config);

    expect(await tool.ok({ action: "reset" })).toEqual({ action: "reset", saved: false, config: initial.config });

    expect(await tool.ok({ action: "subscriptions" })).toEqual({ action: "subscriptions", subscriptions: [] });
    expect(await tool.failure({ action: "revoke", id: randomUUID() })).toEqual({
      kind: "not_found",
      error: "calendarSubscriptionNotFound",
      path: ["id"],
    });
  });

  it("keeps the configuration personal and leaves out lists a schema manager cannot read", async () => {
    const workspace = await workspaceWithDueDate();
    const admin = calendarTool(workspace);
    const member = calendarTool(workspace, workspace.member);
    const [list] = (await admin.ok({ action: "options" })).lists ?? [];
    expect((await admin.ok({ action: "update", config: { mode: "agenda" } })).saved).toBe(true);

    const roleId = workspace.member.roleId;
    if (!roleId) throw new Error("The member has no role");
    await runWithoutTenant(() =>
      prisma.rolePermission.create({
        data: { companyId: workspace.companyId, roleId, resource: "dataModel", action: "update" },
      }),
    );
    expect(await member.ok({ action: "read" })).toMatchObject({
      saved: false,
      config: { mode: "month", sources: [] },
    });
    expect((await member.ok({ action: "options" })).lists).toEqual([]);
    const page = await workspace.as(workspace.member, () => getGetPlannerOptionsInteractor().invoke());
    expect(page.ok && page.data.model.types.map((type) => type.id)).not.toContain(list.typeId);
    expect(
      await member.failure({
        action: "update",
        config: { sources: [{ typeId: list.typeId, calendar: { dateFieldId: list.dateFields[0].id } }] },
      }),
    ).toEqual({ kind: "not_found", error: "recordTypeNotFound", path: ["config", "sources", 0, "typeId"] });
  });

  it("shows the caller's own connected calendars, saves valid filters and colors, and revokes a subscription", async () => {
    const workspace = await workspaceWithDueDate();
    const tool = calendarTool(workspace);
    const today = new Date().toISOString().slice(0, 10);
    const { own, foreign } = await runWithoutTenant(async () => {
      await prisma.subscription.create({ data: { companyId: workspace.companyId, status: "active", plan: "pro" } });
      const calendar = async (userId: string, name: string) => {
        const account = await prisma.connectedAccount.create({
          data: {
            companyId: workspace.companyId,
            userId,
            provider: "mail",
            unipileAccountId: `planner-${randomUUID()}`,
            status: "ok",
          },
        });
        return prisma.calendar.create({
          data: {
            companyId: workspace.companyId,
            connectedAccountId: account.id,
            unipileCalendarId: randomUUID(),
            name,
          },
        });
      };
      const own = await calendar(workspace.admin.id, "Team calendar");
      const foreign = await calendar(workspace.member.id, "Private calendar");
      await prisma.calendarEvent.create({
        data: {
          companyId: workspace.companyId,
          connectedAccountId: own.connectedAccountId,
          calendarId: own.id,
          unipileEventId: randomUUID(),
          title: "Renewal call",
          startsAt: new Date(`${today}T09:00:00Z`),
          endsAt: new Date(`${today}T10:00:00Z`),
          attendeeEmails: [],
        },
      });
      return { own, foreign };
    });

    const options = await tool.ok({ action: "options" });
    expect(options.personalAvailable).toBe(true);
    expect(options.calendars).toEqual([{ id: own.id, name: "Team calendar", provider: "mail" }]);
    const list = options.lists?.find((item) => item.typeId === workspace.id("deal"));
    const dueOn = list?.dateFields.find((field) => field.label === "Due on");
    const color = list?.colorFields[0];
    if (!list || !dueOn || !color) throw new Error("The deal list has no Due on or select field");

    expect(await tool.failure({ action: "update", config: { calendarIds: [foreign.id] } })).toEqual({
      kind: "not_found",
      error: "calendarNotFound",
      path: ["config", "calendarIds", 0],
    });
    const source = {
      typeId: list.typeId,
      calendar: { dateFieldId: dueOn.id, colorFieldId: color.id },
      filters: [{ field: dueOn.id, operator: FilterOperatorKey.isNotNull }],
      enabled: true,
      color: "warning",
    };
    const saved = await tool.ok({
      action: "update",
      config: { sources: [source], calendarIds: [own.id], timeZone: "UTC" },
    });
    expect(saved.config).toMatchObject({ calendarIds: [own.id], sources: [source] });
    expect((await tool.ok({ action: "read" })).config).toEqual(saved.config);
    const config = saved.config;
    if (!config) throw new Error("No configuration");
    const planner = await workspace.as(workspace.admin, () =>
      getReadPlannerInteractor().invoke({ config, window: { from: today, to: today } }),
    );
    expect(planner.ok && planner.data.sources.map((item) => item.status)).toEqual(["ready"]);
    expect(planner.ok && planner.data.events.map((event) => event.title)).toEqual(["Renewal call"]);

    const created = await workspace.as(workspace.admin, () =>
      getManageCalendarSubscriptionsInteractor().invoke({ action: "create", config, includePersonalEvents: false }),
    );
    if (!created.ok || !created.data.created) throw new Error("The subscription was not created");
    const { id } = created.data.created;
    expect((await tool.ok({ action: "subscriptions" })).subscriptions?.map((item) => item.id)).toEqual([id]);
    expect(await calendarTool(workspace, workspace.member).failure({ action: "revoke", id })).toMatchObject({
      error: "calendarSubscriptionNotFound",
    });
    expect(await tool.ok({ action: "revoke", id })).toEqual({ action: "revoke", subscriptions: [] });
  });
});
