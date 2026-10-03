import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  createLegacyMigrationDatabase,
  CRM_CONTRACTION_MIGRATION,
  legacyFixtureWriter,
} from "@/tests/helpers/legacy-migration-database";
import { prepareLegacyContraction } from "../prepare";
import { LEGACY_CRM_TABLES } from "../tables";
import { presentationFixture } from "../../v5/__tests__/fixture";
import { migrateRecordWorkspace } from "../../run";
import { finalizeReconciledRecordWorkspace } from "../../v7/finalize";

const database = getLocalDatabaseTestUrl();
const suite = database ? describe : describe.skip;
const sql = () => readFile(resolve("prisma/migrations", CRM_CONTRACTION_MIGRATION, "migration.sql"), "utf8");
suite("guarded legacy storage contraction", { timeout: 120000 }, () => {
  it("drops every legacy table on an empty installation and retains generic storage", async () => {
    const fixture = await createLegacyMigrationDatabase(database);
    try {
      await fixture.client.query(await sql());
      const tables = await fixture.client.query(
        "SELECT name,to_regclass(format('%I',name)) AS table FROM unnest($1::text[]) name",
        [LEGACY_CRM_TABLES],
      );
      expect(tables.rows.every((row) => row.table === null)).toBe(true);
      expect((await fixture.client.query("SELECT to_regclass('\"CrmRecord\"') AS table")).rows[0].table).not.toBeNull();
      expect(await prepareLegacyContraction(fixture.client)).toMatchObject({ alreadyContracted: true });
    } finally {
      await fixture.close();
    }
  });
  it("refuses an unmigrated populated workspace without removing its data", async () => {
    const fixture = await createLegacyMigrationDatabase(database);
    try {
      const writer = legacyFixtureWriter(fixture.client);
      const company = await writer.company.create({ data: {} });
      const contact = await writer.contact.create({
        data: { companyId: company.id, firstName: "Preserved", lastName: "Source" },
      });
      await expect(fixture.client.query(await sql())).rejects.toThrow("contraction refused");
      await fixture.client.query("ROLLBACK");
      expect((await fixture.client.query('SELECT id FROM "Contact" WHERE id=$1', [contact.id])).rows).toHaveLength(1);
      await expect(prepareLegacyContraction(fixture.client)).rejects.toThrow("reconciled generic upgrade");
    } finally {
      await fixture.close();
    }
  });
  it("reconciles an upgrade, rejects source drift and publishes removal while retaining migrated values", async () => {
    const fixture = await createLegacyMigrationDatabase(database);
    try {
      const source = await presentationFixture(fixture.client);
      expect((await migrateRecordWorkspace(fixture.client, source.companyId, "backfill", 6)).ok).toBe(true);
      expect((await migrateRecordWorkspace(fixture.client, source.companyId, "reconcile", 6)).ok).toBe(true);
      await finalizeReconciledRecordWorkspace(fixture.client, source.companyId);
      await prepareLegacyContraction(fixture.client);
      await fixture.client.query('UPDATE "Deal" SET name=\'Drift\' WHERE "companyId"=$1', [source.companyId]);
      await expect(fixture.client.query(await sql())).rejects.toThrow("contraction refused");
      await fixture.client.query("ROLLBACK");
      await expect(prepareLegacyContraction(fixture.client)).rejects.toThrow("source changed");
      await fixture.client.query('UPDATE "Deal" SET name=\'Synthetic deal\' WHERE "companyId"=$1', [source.companyId]);
      await prepareLegacyContraction(fixture.client);
      const before = (
        await fixture.client.query(
          'SELECT "typeId","recordId","fieldId",state,"decimalValue"::text AS value FROM "RecordValue" WHERE "companyId"=$1 ORDER BY "typeId","recordId","fieldId"',
          [source.companyId],
        )
      ).rows;
      await fixture.client.query(await sql());
      const after = (
        await fixture.client.query(
          'SELECT "typeId","recordId","fieldId",state,"decimalValue"::text AS value FROM "RecordValue" WHERE "companyId"=$1 ORDER BY "typeId","recordId","fieldId"',
          [source.companyId],
        )
      ).rows;
      expect(after).toEqual(before);
      expect(
        (
          await fixture.client.query(
            'SELECT COUNT(*)::int AS count FROM "RecordMigrationCheckpoint" WHERE "companyId"=$1 AND version=8',
            [source.companyId],
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      await fixture.close();
    }
  });
  it("preserves legacy naming preferences and timeline views after the source tables are removed", async () => {
    const fixture = await createLegacyMigrationDatabase(database);
    try {
      const source = await presentationFixture(fixture.client);
      await source.insert("EntityTerminology", { entityType: "contact", presetKey: "person" });
      const filters = [
        { field: "contactIds", operator: "in", value: [source.recordId] },
        { field: "timelineKind", operator: "in", value: ["changes"] },
      ];
      const viewId = await source.insert("DataView", {
        userId: source.userId,
        surfaceKey: "entity-timeline",
        name: "Person changes",
        position: 0,
        filters: JSON.stringify(filters),
      });
      const p13nId = await source.insert("P13n", {
        userId: source.userId,
        p13nId: "entity-timeline",
        filters: JSON.stringify(filters),
        columnOrder: [],
        hiddenColumns: [],
      });
      expect((await migrateRecordWorkspace(fixture.client, source.companyId, "backfill", 6)).ok).toBe(true);
      expect((await migrateRecordWorkspace(fixture.client, source.companyId, "reconcile", 6)).ok).toBe(true);
      await finalizeReconciledRecordWorkspace(fixture.client, source.companyId);
      await prepareLegacyContraction(fixture.client);
      await prepareLegacyContraction(fixture.client);
      await fixture.client.query(await sql());
      const type = (
        await fixture.client.query(
          'SELECT label,"pluralLabel",definition FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2',
          [source.companyId, source.id("contact")],
        )
      ).rows[0];
      expect(type).toMatchObject({
        label: "Person",
        pluralLabel: "People",
        definition: { label: "Person", pluralLabel: "People" },
      });
      const expected = [{ ...filters[0], field: `records:${source.id("contact")}` }, filters[1]];
      for (const [table, id] of [
        ["DataView", viewId],
        ["P13n", p13nId],
      ])
        expect((await source.read(table, id))?.filters).toEqual(expected);
      expect(
        (
          await fixture.client.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId"=$1', [
            source.companyId,
          ])
        ).rows[0].revision,
      ).toBe(4);
      expect(
        (
          await fixture.client.query(
            'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 AND revision=4',
            [source.companyId],
          )
        ).rows[0].snapshot.types.find((type: { id: string }) => type.id === source.id("contact")),
      ).toMatchObject({ label: "Person", pluralLabel: "People" });
    } finally {
      await fixture.close();
    }
  });
});
