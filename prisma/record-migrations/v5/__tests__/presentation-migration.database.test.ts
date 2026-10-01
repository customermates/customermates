import { compileRecordMeasure } from "@/features/records/record-measure";
import type { RecordMeasure } from "@/features/records/record-measure.schema";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createLegacyMigrationDatabase } from "@/tests/helpers/legacy-migration-database";
import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import type { ClientBase } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { migrateRecordWorkspace } from "../../run";
import { migrateRecordPresentation } from "../run";
import { presentationFixture, timestamps } from "./fixture";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const companies: string[] = [];
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];
type Fixture = Awaited<ReturnType<typeof presentationFixture>>;
async function fixture(probability: 60 | 0 | null = 60) {
  const database = await createLegacyMigrationDatabase(databaseUrl);
  databases.push(database);
  const { client } = database;
  return presentationFixture(client, probability, (companyId) => companies.push(companyId));
}
async function results(f: Fixture, widgetId: string, overall = false) {
  const model = RecordModelSchema.parse(
    (
      await f.client.query('SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = 3', [
        f.companyId,
      ])
    ).rows[0].snapshot,
  );
  const measure: RecordMeasure = RecordMeasureSchema.parse((await f.read("Widget", widgetId))?.measure);
  const sql = compileRecordMeasure(
    f.companyId,
    overall ? { ...measure, groupBy: null } : measure,
    model,
    new Map(model.types.map((type) => [type.id, { access: "all", userId: f.userId }])),
    "EUR",
  );
  return (await f.client.query(sql.text, sql.values)).rows.map((row) => ({
    ...row,
    resultValue: row.resultValue === null ? null : new Decimal(row.resultValue).toFixed(),
  }));
}
async function revision(f: Fixture) {
  return (await f.client.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId" = $1', [f.companyId]))
    .rows[0]?.revision;
}
async function expectNoEvents(f: Fixture) {
  expect(
    (await f.client.query('SELECT COUNT(*) FROM "RecordEvent" WHERE "companyId" = $1', [f.companyId])).rows[0].count,
  ).toBe("0");
}

describeDatabase("version five presentation database migration", { timeout: 60000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  }, 60000);

  it("preserves identities, owners, timestamps, explicit overrides and unrelated surfaces across repeat runs", async () => {
    const f = await fixture();
    const untouched = [await f.read("DataView", f.systemView), await f.read("P13n", f.systemPreference)];
    expect(await migrateRecordWorkspace(f.client, f.companyId, "preflight")).toMatchObject({
      ok: true,
      presentation: { views: 15, preferences: 10, charts: 6 },
    });
    expect(await revision(f)).toBeUndefined();
    const report = await migrateRecordWorkspace(f.client, f.companyId, "backfill");
    expect(report, JSON.stringify(report)).toMatchObject({
      ok: true,
      presentation: { views: 15, preferences: 10, charts: 6, resumed: false },
    });
    expect(await revision(f)).toBe(3);
    for (const [kind, ids] of f.views) {
      const introduced =
        kind === "contact"
          ? [f.id("contact.firstName"), f.id("contact.lastName"), f.id("contact.avatarUrl")]
          : kind === "deal" || kind === "service"
            ? [`relationship:${f.id(`lineItem.${kind}`)}:incoming`]
            : [];
      const all = await f.read("DataView", ids[0]);
      expect(all).toMatchObject({
        id: ids[0],
        userId: f.userId,
        surfaceKey: `records:${f.id(kind)}`,
        filters: null,
        columnOrder: null,
        pageSize: null,
      });
      expect(all?.createdAt).toBe(timestamps.createdAt.slice(0, -1));
      expect(all?.updatedAt).toBe(timestamps.updatedAt.slice(0, -1));
      expect(await f.read("DataView", ids[1])).toMatchObject({
        name: "My board",
        position: 1,
        pageSize: 10,
        viewMode: "card",
        grouping: { field: f.fields.get(kind) },
        columnOrder: [f.id(`${kind}.name`), f.fields.get(kind)],
        hiddenColumns: ["system:updatedAt", ...introduced],
        columnWidths: { [f.id(`${kind}.name`)]: 220 },
        filters: [{ field: "system:assignedTo", operator: "in", value: [f.userId] }],
      });
      expect(await f.read("DataView", ids[2])).toMatchObject({
        filters: [],
        sortDescriptor: {},
        columnOrder: [],
        columnWidths: {},
        hiddenColumns: introduced,
      });
    }
    for (const [kind, id] of f.preferences) {
      expect(await f.read("P13n", id)).toMatchObject({
        p13nId: `records:${f.id(kind)}`,
        activeViewKey: f.views.get(kind)?.[1],
        viewStateKeys: ["columnOrder", "filters", "sortDescriptor", "pageSize"],
        columnOrder: [f.id(`${kind}.name`)],
        pagination: { page: 2, pageSize: 10 },
        sortDescriptor: {},
      });
    }
    for (const [kind, id] of f.details) {
      expect(await f.read("P13n", id)).toMatchObject({
        p13nId: `record-detail:${f.id(kind)}`,
        columnOrder: [f.id(`${kind}.name`), "system:assignedTo"],
        detailOptions: {
          starredFieldIds: [f.id(`${kind}.name`)],
          hiddenFieldIds: ["system:createdAt"],
          collapsedSectionIds: ["relations"],
        },
      });
    }
    expect([await f.read("DataView", f.systemView), await f.read("P13n", f.systemPreference)]).toEqual(untouched);
    expect(await f.read("Widget", f.widgets.deals)).toMatchObject({
      userId: f.userId,
      name: "Deal values",
      version: 1,
      displayOptions: {
        displayType: "horizontalBarChart",
        showLegend: false,
        reverseXAxis: true,
        barColors: ["primary1"],
      },
      layout: { lg: { i: f.recordId, x: 1, y: 2, w: 4, h: 5 } },
    });
    expect(
      (
        await f.client.query('SELECT "typeId" FROM "CrmRecord" WHERE "companyId" = $1 AND id = $2', [
          f.companyId,
          f.recordId,
        ])
      ).rows,
    ).toHaveLength(6);
    expect(await migrateRecordWorkspace(f.client, f.companyId, "backfill")).toMatchObject({
      ok: true,
      presentation: { resumed: true },
    });
    expect(await migrateRecordWorkspace(f.client, f.companyId, "reconcile")).toMatchObject({ ok: true });
    await expectNoEvents(f);
  });

  it.each([60, 0, null] as const)(
    "reconciles exact widget contributions with probability %s using independent source SQL",
    async (probability) => {
      const f = await fixture(probability);
      const report = await migrateRecordWorkspace(f.client, f.companyId, "backfill");
      expect(report, JSON.stringify(report)).toMatchObject({ ok: true });
      const legacy = (
        await f.client.query(
          'SELECT SUM(line.quantity::numeric * service.amount::numeric)::text AS value, SUM(line.quantity::numeric)::text AS quantity FROM "ServiceDeal" line JOIN "Service" service ON service."companyId" = line."companyId" AND service.id = line."serviceId" WHERE line."companyId" = $1',
          [f.companyId],
        )
      ).rows[0];
      expect(legacy).toEqual({ value: "5200", quantity: "10" });
      expect(await results(f, f.widgets.deals)).toMatchObject([
        { count: 2, resultState: "value", resultValue: legacy.value },
      ]);
      expect(await results(f, f.widgets.weighted)).toMatchObject([
        {
          count: 2,
          resultState: probability === null ? "missing" : "value",
          resultValue: String(probability === null ? 0 : (5200 * probability) / 100),
        },
      ]);
      const groups = await results(f, f.widgets.organizations);
      expect(groups).toHaveLength(2);
      expect(groups.map((row) => row.groupRecordId).sort()).toEqual([f.recordId, f.organizationB].sort());
      for (const row of groups) expect(row).toMatchObject({ count: 2, resultValue: "5200" });
      expect(await results(f, f.widgets.organizations, true)).toMatchObject([{ count: 2, resultValue: "5200" }]);
      expect(await results(f, f.widgets.quantity)).toMatchObject([
        { count: 2, resultValue: "4" },
        { count: 2, resultValue: "6" },
      ]);
      expect(await results(f, f.widgets.quantity, true)).toMatchObject([{ count: 4, resultValue: legacy.quantity }]);
      expect(await results(f, f.widgets.amount)).toMatchObject([
        { count: 2, resultValue: "4000" },
        { count: 2, resultValue: "1200" },
      ]);
      expect(await results(f, f.widgets.filtered)).toMatchObject([
        { groupRecordId: f.recordId, count: 2, resultValue: "4000" },
      ]);
      await expectNoEvents(f);
    },
  );

  it("rejects stale fields, cross-workspace records and members without changing presentation rows", async () => {
    const f = await fixture();
    const foreign = await presentationFixture(f.client);
    expect(await migrateRecordWorkspace(f.client, f.companyId, "backfill", 4)).toMatchObject({ ok: true });
    const viewId = f.views.get("deal")?.[0];
    if (!viewId) throw new Error("Missing fixture view");
    for (const filters of [
      [{ field: randomUUID(), operator: "equals", value: "x" }],
      [{ field: "serviceIds", operator: "in", value: [foreign.recordId] }],
      [{ field: "userIds", operator: "in", value: [foreign.userId] }],
      [{ field: f.fields.get("deal"), operator: "in", value: ["removed-option"] }],
    ]) {
      await f.client.query('UPDATE "DataView" SET filters = $2::jsonb WHERE id = $1', [
        viewId,
        JSON.stringify(filters),
      ]);
      const report = await migrateRecordPresentation(f.client, f.companyId, "backfill");
      expect(report.ok).toBe(false);
      expect(report.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ table: "DataView", id: viewId })]),
      );
      expect(await revision(f)).toBe(2);
      expect(await f.read("DataView", viewId)).toMatchObject({ surfaceKey: "deals-card-store", filters });
    }
    await expectNoEvents(f);
  });

  it("rejects target collisions, foreign owners and active views from another surface", async () => {
    const f = await fixture();
    const foreign = await presentationFixture(f.client, 60, (companyId) => companies.push(companyId));
    expect(await migrateRecordWorkspace(f.client, f.companyId, "backfill", 4)).toMatchObject({ ok: true });
    const collision = await f.insert("DataView", {
      userId: f.userId,
      surfaceKey: `records:${f.id("deal")}`,
      name: "Already configured",
    });
    expect(await migrateRecordPresentation(f.client, f.companyId, "backfill")).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "presentation_target_collision" })]),
    });
    await f.client.query('DELETE FROM "DataView" WHERE id = $1', [collision]);
    await f.client.query('UPDATE "P13n" SET "activeViewKey" = $2 WHERE id = $1', [
      f.preferences.get("deal"),
      f.views.get("contact")?.[0],
    ]);
    await f.client.query('UPDATE "Widget" SET "userId" = $2 WHERE id = $1', [f.widgets.deals, foreign.userId]);
    expect(await migrateRecordPresentation(f.client, f.companyId, "backfill")).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "foreign_presentation_owner" }),
        expect.objectContaining({ code: "unresolved_active_view" }),
      ]),
    });
    expect(await revision(f)).toBe(2);
  });

  it("detects altered migrated data, metadata, provenance and predecessor activity on replay", async () => {
    const f = await fixture();
    expect(await migrateRecordWorkspace(f.client, f.companyId, "backfill")).toMatchObject({ ok: true });
    await f.client.query('UPDATE "Widget" SET "activityQuery" = \'{}\'::jsonb WHERE id = $1', [f.widgets.activity]);
    await f.client.query('UPDATE "DataView" SET "columnOrder" = \'[]\'::jsonb WHERE id = $1', [
      f.views.get("deal")?.[1],
    ]);
    await f.client.query('DELETE FROM "RecordValueDependency" WHERE "companyId" = $1 AND "fieldId" = $2', [
      f.companyId,
      f.id("deal.totalValue"),
    ]);
    await f.client.query(
      'UPDATE "RecordTypeDefinition" SET definition = jsonb_set(definition, \'{label}\', \'"Changed"\'::jsonb) WHERE "companyId" = $1 AND id = $2',
      [f.companyId, f.id("deal")],
    );
    const report = await migrateRecordWorkspace(f.client, f.companyId, "reconcile");
    expect(report).toMatchObject({
      ok: false,
      presentation: {
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "predecessor_activity_changed" }),
          expect.objectContaining({ code: "presentation_changed_since_migration" }),
          expect.objectContaining({ code: "provenance_mismatch" }),
          expect.objectContaining({ code: "model_changed_since_backfill" }),
        ]),
      },
    });
  });

  it("rolls back an interrupted publication and retries after a lost committed response", async () => {
    const f = await fixture();
    expect(await migrateRecordWorkspace(f.client, f.companyId, "backfill", 4)).toMatchObject({ ok: true });
    const fail = (after: boolean) =>
      new Proxy(f.client, {
        get(target, key) {
          if (key !== "query") return Reflect.get(target, key);
          return async (...args: unknown[]) => {
            if (args[0] === "COMMIT" && !after) throw new Error("Interrupted publication");
            const result = await Reflect.apply(target.query.bind(target), target, args);
            if (args[0] === "COMMIT" && after) throw new Error("Lost response");
            return result;
          };
        },
      }) as ClientBase;
    await expect(migrateRecordPresentation(fail(false), f.companyId, "backfill")).rejects.toThrow(
      "Interrupted publication",
    );
    expect(await revision(f)).toBe(2);
    expect(
      (
        await f.client.query(
          'SELECT COUNT(*) FROM "DataView" WHERE "companyId" = $1 AND "surfaceKey" LIKE \'records:%\'',
          [f.companyId],
        )
      ).rows[0].count,
    ).toBe("0");
    await expect(migrateRecordPresentation(fail(true), f.companyId, "backfill")).rejects.toThrow("Lost response");
    expect(await revision(f)).toBe(3);
    expect(await migrateRecordWorkspace(f.client, f.companyId, "reconcile")).toMatchObject({
      ok: true,
      presentation: { resumed: true },
    });
    await expectNoEvents(f);
  });

  it("refuses a workspace with a published custom schema or active operation", async () => {
    const f = await fixture();
    expect(await migrateRecordWorkspace(f.client, f.companyId, "backfill", 4)).toMatchObject({ ok: true });
    await f.client.query('UPDATE "RecordSchemaState" SET "storageMode" = \'generic\' WHERE "companyId" = $1', [
      f.companyId,
    ]);
    await expect(migrateRecordPresentation(f.client, f.companyId, "backfill")).rejects.toThrow("active or configured");
    await f.client.query(
      'UPDATE "RecordSchemaState" SET "storageMode" = \'backfilled\', "activeOperationId" = $2 WHERE "companyId" = $1',
      [f.companyId, randomUUID()],
    );
    await expect(migrateRecordPresentation(f.client, f.companyId, "backfill")).rejects.toThrow("active or configured");
  });
});
