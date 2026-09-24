import type * as Di from "@/core/di";
import type * as DataViewTools from "../data-view.mcp-tools";
import type * as McpTools from "../mcp-tool";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { OPERATOR_DATA_VIEW_SURFACE_KEYS } from "@/core/data-view/ai-manageable-surfaces";
import type { McpToolExecutionResult } from "../mcp-tool";
import en from "@/i18n/locales/en.json";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve(
      Object.assign((key: string) => key, {
        raw: (key: string) => (en.Common.errors as Record<string, string>)[key] ?? key,
      }),
    ),
}));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("saved views through MCP and the real page query", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const outsiderId = randomUUID();
  const matchingContact = randomUUID();
  const otherContact = randomUUID();
  const tenant = (id = ownerId, company = companyId) => createMockUser({ id, companyId: company });
  let di: typeof Di;
  let tool: typeof DataViewTools;
  let execute: typeof McpTools.executeMcpTool;
  let viewId: string;

  const run = (input: Record<string, unknown>, user = tenant()): Promise<McpToolExecutionResult> =>
    runWithTenant(user, () => execute(tool.manageDataViewsTool, [input]));
  const page = (viewKey?: string) =>
    runWithTenant(tenant(), () =>
      di.getGetContactsInteractor().invoke({ p13nId: SURFACE.contacts, ...(viewKey ? { viewId: viewKey } : {}) }),
    );

  beforeAll(async () => {
    di = await import("@/core/di");
    tool = await import("../data-view.mcp-tools");
    ({ executeMcpTool: execute } = await import("../mcp-tool"));
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, otherCompanyId],
    );
    for (const [id, company] of [
      [ownerId, companyId],
      [colleagueId, companyId],
      [outsiderId, otherCompanyId],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `saved-view-${id}@example.invalid`, "Saved", "View", company],
      );
    }
    for (const [id, name] of [
      [matchingContact, "Ada"],
      [otherContact, "Grace"],
    ]) {
      await client.query(
        'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [id, name, "Lovelace", companyId],
      );
    }
  }, 60000);

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" IN ($1, $2)', [companyId, otherCompanyId]);
    await client.end();
  });

  it("discovers capabilities, creates a view, and resolves its actual filtered rows in the page", async () => {
    const config = await run({
      action: "config",
      surfaceKey: SURFACE.contacts,
      section: "filters",
      query: "firstName",
    });
    expect(config.ok && config.structuredContent?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "firstName" })]),
    );
    const created = await run({
      action: "create",
      surfaceKey: SURFACE.contacts,
      name: "Ada contacts",
      state: { filters: [{ field: "firstName", operator: "equals", value: "Ada" }], pageSize: 10 },
    });
    expect(created.ok).toBe(true);
    viewId = String(created.ok && created.structuredContent?.viewKey);
    expect(created.ok && created.structuredContent?.link).toBe(`/contacts?view=${viewId}`);
    const result = await page();
    expect(result.ok && result.data.activeViewKey).toBe(viewId);
    expect(result.ok && result.data.items.map(({ id }) => id)).toEqual([matchingContact]);
  });

  it("explains an invalid All rename and accepts the corrected timeline patch without creating a view", async () => {
    const state = { filters: [{ field: "timelineKind", operator: "in", value: ["changes"] }] };
    const invalid = await run({
      action: "update",
      surfaceKey: SURFACE.entityTimeline,
      viewKey: ALL_VIEW_KEY,
      name: "All",
      state,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.result).toContain("The All view cannot be renamed. Omit name");
    expect(invalid.result).toContain("Read config");
    const before = await run({ action: "list", surfaceKey: SURFACE.entityTimeline, viewKey: ALL_VIEW_KEY });
    expect(before.ok && (before.structuredContent?.items as Array<{ state: unknown }> | undefined)?.[0]?.state).toEqual(
      {},
    );
    const corrected = await run({ action: "update", surfaceKey: SURFACE.entityTimeline, viewKey: ALL_VIEW_KEY, state });
    expect(corrected.ok, corrected.result).toBe(true);
    const after = await run({ action: "list", surfaceKey: SURFACE.entityTimeline, viewKey: ALL_VIEW_KEY });
    expect(
      after.ok && (after.structuredContent?.items as Array<{ state: unknown }> | undefined)?.[0]?.state,
    ).toMatchObject(state);
    const summaries = await run({ action: "list", surfaceKey: SURFACE.entityTimeline });
    expect(summaries.ok && summaries.structuredContent?.items).toEqual([]);
  });

  it("hides and refuses another user's and another company's view, including select", async () => {
    for (const user of [tenant(colleagueId), tenant(outsiderId, otherCompanyId)]) {
      const listed = await run({ action: "list", surfaceKey: SURFACE.contacts }, user);
      expect(listed.ok && listed.structuredContent?.items).toEqual([]);
      for (const action of ["update", "select", "delete"]) {
        const result = await run(
          { action, surfaceKey: SURFACE.contacts, viewKey: viewId, ...(action === "update" ? { name: "Stolen" } : {}) },
          user,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.kind).toBe("not_found");
      }
    }
  });

  it("patches only requested named-view fields, and All selection preserves the saved view", async () => {
    await runWithTenant(tenant(), () =>
      di.getSaveDataViewStateInteractor().invoke({
        surfaceKey: SURFACE.contacts,
        viewKey: viewId,
        state: {
          sortDescriptor: { field: "createdAt", direction: "desc" },
          grouping: { field: "createdAt", bucket: "month" },
          columnWidths: { name: 240 },
          hiddenColumns: ["createdAt"],
          pageSize: 25,
        },
      }),
    );

    const appearance = await run({
      action: "update",
      surfaceKey: SURFACE.contacts,
      viewKey: viewId,
      state: { viewMode: "card" },
    });
    expect(appearance.ok && appearance.structuredContent?.state).toMatchObject({
      filters: [{ field: "firstName", operator: "equals", value: "Ada" }],
      sortDescriptor: { field: "createdAt", direction: "desc" },
      grouping: { field: "createdAt", bucket: "month" },
      pageSize: 25,
      viewMode: "card",
      columnWidths: { name: 240 },
      hiddenColumns: ["createdAt"],
    });

    const updated = await run({
      action: "update",
      surfaceKey: SURFACE.contacts,
      viewKey: viewId,
      state: { filters: [], searchTerm: "Grace" },
    });
    expect(updated.ok && updated.structuredContent?.state).toMatchObject({
      filters: [],
      searchTerm: "Grace",
      sortDescriptor: { field: "createdAt", direction: "desc" },
      grouping: { field: "createdAt", bucket: "month" },
      pageSize: 25,
      viewMode: "card",
      columnWidths: { name: 240 },
      hiddenColumns: ["createdAt"],
    });
    const beforeRename = await run({ action: "list", surfaceKey: SURFACE.contacts, viewKey: viewId });
    const beforeRenameItem = (beforeRename.ok && beforeRename.structuredContent?.items) as
      | Array<{ name: string; state: unknown }>
      | undefined;
    expect((await run({ action: "update", surfaceKey: SURFACE.contacts, viewKey: viewId, name: "Renamed" })).ok).toBe(
      true,
    );
    const afterRename = await run({ action: "list", surfaceKey: SURFACE.contacts, viewKey: viewId });
    const afterRenameItem = (afterRename.ok && afterRename.structuredContent?.items) as
      | Array<{ name: string; state: unknown }>
      | undefined;
    expect(afterRenameItem?.[0]).toMatchObject({ name: "Renamed", state: beforeRenameItem?.[0]?.state });
    const result = await page(viewId);
    expect(result.ok && result.data.items.map(({ id }) => id)).toEqual([otherContact]);
    expect((await run({ action: "select", surfaceKey: SURFACE.contacts, viewKey: ALL_VIEW_KEY })).ok).toBe(true);
    const all = await page();
    expect(all.ok && all.data.items).toHaveLength(2);
    expect(all.ok && all.data.views?.map(({ id }) => id)).toContain(viewId);
  });

  it("rejects invented fields without corrupting persistence, then deletes the view without deleting records", async () => {
    const invalid = await run({
      action: "update",
      surfaceKey: SURFACE.contacts,
      viewKey: viewId,
      state: { filters: [{ field: "invented", operator: "equals", value: "Ada" }] },
    });
    expect(invalid.ok).toBe(false);
    expect((await run({ action: "select", surfaceKey: SURFACE.contacts, viewKey: viewId })).ok).toBe(true);
    expect((await run({ action: "delete", surfaceKey: SURFACE.contacts, viewKey: viewId })).ok).toBe(true);
    const result = await page();
    expect(result.ok && result.data.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(result.ok && result.data.views).toEqual([]);
    expect(result.ok && result.data.items).toHaveLength(2);
  });

  it("keeps operator views outside MCP discovery and leaves their stored rows unchanged", async () => {
    const operatorView = await runWithTenant(tenant(), async () => {
      const created = await di.getDataViewRepo().createView({
        surfaceKey: SURFACE.operatorUsers,
        name: "Manual operator view",
        position: 0,
        state: { searchTerm: "manual" },
      });
      await di.getP13nRepo().upsertP13n({ p13nId: SURFACE.operatorUsers, activeViewKey: created.id });
      return created;
    });
    const snapshot = async () => {
      const dataViews = await client.query(
        'SELECT row_to_json(d) AS row FROM "DataView" d WHERE "companyId" = $1 AND "userId" = $2 AND "surfaceKey" = ANY($3::text[]) ORDER BY "id"',
        [companyId, ownerId, OPERATOR_DATA_VIEW_SURFACE_KEYS],
      );
      const personalization = await client.query(
        'SELECT row_to_json(p) AS row FROM "P13n" p WHERE "companyId" = $1 AND "userId" = $2 AND "p13nId" = ANY($3::text[]) ORDER BY "id"',
        [companyId, ownerId, OPERATOR_DATA_VIEW_SURFACE_KEYS],
      );
      return { dataViews: dataViews.rows, personalization: personalization.rows };
    };
    const before = await snapshot();

    const surfaces = await run({ action: "surfaces" });
    const surfaceKeys = ((surfaces.ok && surfaces.structuredContent?.items) || []) as Array<{ surfaceKey?: string }>;
    expect(
      surfaceKeys
        .map(({ surfaceKey }) => surfaceKey)
        .filter((surfaceKey) => OPERATOR_DATA_VIEW_SURFACE_KEYS.includes(surfaceKey as never)),
    ).toEqual([]);
    for (const input of [
      { action: "create", surfaceKey: SURFACE.operatorUsers, name: "AI operator view", state: {} },
      { action: "delete", surfaceKey: SURFACE.operatorUsers, viewKey: operatorView.id },
    ]) {
      const result = await run(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.kind).toBe("validation");
    }

    expect(await snapshot()).toEqual(before);
  });
});
