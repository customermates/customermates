import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { readRecordModelSnapshot } from "@/features/records/record-model-snapshot";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createLegacyMigrationDatabase, legacyFixtureWriter } from "@/tests/helpers/legacy-migration-database";
import { randomUUID } from "node:crypto";
import type { ClientBase } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { migrateRecordWorkspace as migrateWorkspace } from "../../run";
import { presetId } from "../../v2/contract/crm-preset";
import { migrateLegacyWorkspace } from "../../v2/run";
import { migrateRecordActivityState } from "../run";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const companies: string[] = [];
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];
const migrateRecordWorkspace = (client: ClientBase, companyId: string, mode: "preflight" | "backfill" | "reconcile") =>
  migrateWorkspace(client, companyId, mode, 4);
async function fixture() {
  const database = await createLegacyMigrationDatabase(databaseUrl);
  databases.push(database);
  const { client } = database;
  const prisma = legacyFixtureWriter(client);
  const source = await (async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({ data: { companyId: company.id, name: "Admin", isSystemRole: true } });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Synthetic",
        lastName: "Migration",
        status: "active",
        email: `${randomUUID()}@example.test`,
      },
    });
    const recordId = randomUUID();
    await prisma.contact.create({
      data: { companyId: company.id, id: recordId, firstName: "Synthetic", lastName: "Person" },
    });
    await prisma.deal.create({
      data: { companyId: company.id, id: recordId, name: "Synthetic deal", totalValue: 2600, totalQuantity: 5 },
    });
    await prisma.service.create({ data: { companyId: company.id, id: recordId, name: "A", amount: 1000 } });
    const otherService = await prisma.service.create({ data: { companyId: company.id, name: "B", amount: 200 } });
    await prisma.serviceDeal.create({
      data: { companyId: company.id, id: recordId, serviceId: recordId, dealId: recordId, quantity: 2 },
    });
    const otherLine = await prisma.serviceDeal.create({
      data: { companyId: company.id, serviceId: otherService.id, dealId: recordId, quantity: 3 },
    });
    const timelineFilters = [
      { field: "timelineKind", operator: "in", value: ["changes", "activities"] },
      { field: "contactIds", operator: "notIn", value: [recordId] },
    ];
    const widget = await prisma.widget.create({
      data: {
        companyId: company.id,
        userId: user.id,
        name: "Saved history",
        kind: "activityTimeline",
        timelineFilters,
        isTemplate: true,
        layout: { lg: { i: recordId, x: 0, y: 0, w: 4, h: 4 } },
        createdAt: new Date("2023-01-02T03:04:05Z"),
        updatedAt: new Date("2024-01-02T03:04:05Z"),
      },
    });
    return { company, user, recordId, otherService, otherLine, widget, timelineFilters };
  })();

  return { ...source, client, id: (key: string) => presetId(source.company.id, key) };
}

describeDatabase("activity and provenance migration", { timeout: 30000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  }, 60000);

  it("migrates immutable configuration, full calculation provenance and saved widget identity without events", async () => {
    const f = await fixture();
    expect(await migrateRecordWorkspace(f.client, f.company.id, "preflight")).toMatchObject({ ok: true });
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "RecordSchemaState" WHERE "companyId" = $1', [f.company.id])).rows[0]
        .count,
    ).toBe("0");
    expect(await migrateRecordWorkspace(f.client, f.company.id, "backfill")).toMatchObject({
      ok: true,
      activities: { widgets: 1, provenance: { dependencyCount: 10 } },
    });
    const snapshots = (
      await f.client.query(
        'SELECT revision, snapshot FROM "RecordSchemaRevision" WHERE "companyId" = $1 ORDER BY revision',
        [f.company.id],
      )
    ).rows;
    expect(snapshots.map((row) => row.revision)).toEqual([1, 2]);
    const model = readRecordModelSnapshot(snapshots[1].snapshot);
    expect(model.activityPaths).toHaveLength(10);
    expect(model.activityPaths.find((path) => path.typeId === f.id("service") && path.includeMessages)?.path).toEqual([
      { relationId: f.id("lineItem.service"), direction: "incoming" },
      { relationId: f.id("lineItem.deal"), direction: "outgoing" },
      { relationId: f.id("deal.contacts"), direction: "outgoing" },
    ]);
    expect(snapshots[0].snapshot.activityPaths).not.toEqual(model.activityPaths);
    const widget = (await f.client.query('SELECT * FROM "Widget" WHERE id = $1', [f.widget.id])).rows[0];
    expect(widget).toMatchObject({
      id: f.widget.id,
      name: f.widget.name,
      userId: f.user.id,
      isTemplate: true,
      version: 1,
      layout: f.widget.layout,
      createdAt: f.widget.createdAt,
      updatedAt: f.widget.updatedAt,
      timelineFilters: f.timelineFilters,
      displayOptions: { showFilters: true },
    });
    expect(RecordActivityQuerySchema.parse(widget.activityQuery).filters).toEqual([
      { kind: "source", operator: "in", values: ["audit", "activity", "calendar_event"] },
      { kind: "record", typeId: f.id("contact"), operator: "notIn", recordIds: [f.recordId] },
    ]);
    const deps = (
      await f.client.query(
        'SELECT "sourceTypeId", "sourceId" FROM "RecordValueDependency" WHERE "companyId" = $1 AND "typeId" = $2 AND "recordId" = $3 AND "fieldId" = $4',
        [f.company.id, f.id("deal"), f.recordId, f.id("deal.totalValue")],
      )
    ).rows;
    expect(deps).toEqual(
      expect.arrayContaining([
        { sourceTypeId: f.id("lineItem"), sourceId: f.recordId },
        { sourceTypeId: f.id("lineItem"), sourceId: f.otherLine.id },
        { sourceTypeId: f.id("service"), sourceId: f.recordId },
        { sourceTypeId: f.id("service"), sourceId: f.otherService.id },
      ]),
    );
    expect(deps).toHaveLength(4);
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "RecordEvent" WHERE "companyId" = $1', [f.company.id])).rows[0].count,
    ).toBe("0");
    expect(await migrateRecordWorkspace(f.client, f.company.id, "backfill")).toMatchObject({
      ok: true,
      activities: { resumed: true },
    });
    expect(await migrateRecordWorkspace(f.client, f.company.id, "reconcile")).toMatchObject({ ok: true });
    expect(
      (
        await f.client.query('SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = 1', [
          f.company.id,
        ])
      ).rows[0].snapshot,
    ).toEqual(snapshots[0].snapshot);
  });

  it("blocks malformed filters and foreign references without partial v4 writes", async () => {
    const f = await fixture();
    const foreign = await fixture();
    expect(await migrateLegacyWorkspace(f.client, f.company.id, "backfill")).toMatchObject({ ok: true });
    await f.client.query('UPDATE "Widget" SET "timelineFilters" = $2 WHERE id = $1', [
      f.widget.id,
      JSON.stringify([{ field: "contactIds", operator: "in", value: [foreign.recordId] }]),
    ]);
    expect(await migrateRecordActivityState(f.client, f.company.id, "backfill")).toMatchObject({
      ok: false,
      issues: [{ table: "Widget", id: f.widget.id, code: "unresolved_activity_reference" }],
    });
    await f.client.query('UPDATE "Widget" SET "timelineFilters" = $2 WHERE id = $1', [
      f.widget.id,
      JSON.stringify([{ field: "unknown", operator: "in", value: ["x"] }]),
    ]);
    expect(await migrateRecordActivityState(f.client, f.company.id, "preflight")).toMatchObject({
      ok: false,
      issues: [{ table: "Widget", id: f.widget.id, code: "unsupported_activity_configuration" }],
    });
    expect(
      (await f.client.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId" = $1', [f.company.id])).rows[0]
        .revision,
    ).toBe(1);
    expect(
      (await f.client.query('SELECT "activityQuery" FROM "Widget" WHERE id = $1', [f.widget.id])).rows[0].activityQuery,
    ).toBeNull();
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "RecordValueDependency" WHERE "companyId" = $1', [f.company.id]))
        .rows[0].count,
    ).toBe("0");
  });

  it("detects damaged provenance and refuses to overwrite a configured workspace", async () => {
    const f = await fixture();
    expect(await migrateRecordWorkspace(f.client, f.company.id, "backfill")).toMatchObject({ ok: true });
    await f.client.query('DELETE FROM "RecordValueDependency" WHERE "companyId" = $1 AND "fieldId" = $2', [
      f.company.id,
      f.id("deal.totalValue"),
    ]);
    expect(await migrateRecordWorkspace(f.client, f.company.id, "reconcile")).toMatchObject({
      ok: false,
      activities: { issues: [{ table: "RecordValueDependency", id: f.recordId, code: "provenance_mismatch" }] },
    });
    await f.client.query('UPDATE "RecordSchemaState" SET "storageMode" = \'generic\' WHERE "companyId" = $1', [
      f.company.id,
    ]);
    await expect(migrateRecordWorkspace(f.client, f.company.id, "backfill")).rejects.toThrow(
      "without a finalization checkpoint",
    );
  });

  it("rolls back interrupted publication and resumes safely after a lost committed response", async () => {
    const f = await fixture();
    expect(await migrateLegacyWorkspace(f.client, f.company.id, "backfill")).toMatchObject({ ok: true });
    const failAtCommit = (after: boolean) =>
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
    await expect(migrateRecordActivityState(failAtCommit(false), f.company.id, "backfill")).rejects.toThrow(
      "Interrupted publication",
    );
    expect(
      (await f.client.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId" = $1', [f.company.id])).rows[0]
        .revision,
    ).toBe(1);
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "RecordValueDependency" WHERE "companyId" = $1', [f.company.id]))
        .rows[0].count,
    ).toBe("0");
    await expect(migrateRecordActivityState(failAtCommit(true), f.company.id, "backfill")).rejects.toThrow(
      "Lost response",
    );
    expect(await migrateRecordActivityState(f.client, f.company.id, "reconcile")).toMatchObject({
      ok: true,
      resumed: true,
    });
  });
});
