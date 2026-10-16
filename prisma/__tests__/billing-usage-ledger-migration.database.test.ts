import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20261016120000_billing_usage_ledger";
const MESSAGING_MIGRATION = "20260625161605_unipile_v2_messaging";
const migrationsRoot = join(process.cwd(), "prisma/migrations");
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

async function withTemporaryDatabase<T>(url: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `billing_usage_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: url });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const isolatedUrl = new URL(url);
    isolatedUrl.pathname = `/${databaseName}`;
    database = new Client({ connectionString: isolatedUrl.toString() });
    await database.connect();
    return await fn(database);
  } finally {
    await database?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}

async function legacyHistory(client: Client) {
  await client.query(`
    INSERT INTO "Company" (id, "createdAt", "updatedAt") VALUES
      ('c-old', '2026-03-01', '2026-03-01'),
      ('c-new', '2026-08-01', '2026-08-01');
    INSERT INTO "UserRole" (id, name, "companyId", "createdAt", "updatedAt") VALUES ('r-admin', 'Admin', 'c-old', NOW(), NOW());
    INSERT INTO "User" (id, "companyId", "roleId", email, "firstName", "lastName", status, "createdAt", "updatedAt", "agentCreditActivatedAt") VALUES
      ('u-reactivated', 'c-old', 'r-admin', 'a@old.example.invalid', 'A', 'One', 'active', '2026-03-01', '2026-09-01', '2026-09-10'),
      ('u-no-anchor', 'c-old', 'r-admin', 'b@old.example.invalid', 'B', 'Two', 'active', '2026-04-01', '2026-04-01', NULL),
      ('u-inactive', 'c-old', 'r-admin', 'c@old.example.invalid', 'C', 'Three', 'inactive', '2026-03-05', '2026-09-20', NULL),
      ('u-pending', 'c-old', NULL, 'd@old.example.invalid', 'D', 'Four', 'pendingAuthorization', '2026-09-05', '2026-09-05', NULL),
      ('u-new', 'c-new', NULL, 'e@new.example.invalid', 'E', 'Five', 'active', '2026-08-01', '2026-08-01', '2026-08-01');
    INSERT INTO "ConnectedAccount" (id, "companyId", "userId", "unipileAccountId", provider, status, "emailAddress", "createdAt", "updatedAt") VALUES
      ('a-live', 'c-old', 'u-reactivated', 'x1', 'google', 'ok', 'live@old.example.invalid', '2026-07-10', '2026-09-01'),
      ('a-soft-no-event', 'c-old', 'u-reactivated', 'x2', 'outlook', 'deleted', 'soft@old.example.invalid', '2026-07-12', '2026-09-15'),
      ('a-soft-event', 'c-old', 'u-reactivated', 'x3', 'mail', 'deleted', 'event@old.example.invalid', '2026-07-15', '2026-09-30');
    INSERT INTO "EventLog" ("companyId", id, "subjectKind", "subjectId", kind, payload, "createdAt") VALUES
      ('c-old', 'e1', 'connected_account', 'a-live', 'connected_account.created', '{"provider":"google","emailAddress":"live@old.example.invalid"}', '2026-07-10'),
      ('c-old', 'e2', 'connected_account', 'a-soft-event', 'connected_account.created', '{"provider":"mail","emailAddress":"event@old.example.invalid"}', '2026-07-15'),
      ('c-old', 'e3', 'connected_account', 'a-soft-event', 'connected_account.deleted', '{"provider":"mail","emailAddress":"event@old.example.invalid"}', '2026-09-22'),
      ('c-old', 'e4', 'connected_account', 'a-gone', 'connected_account.created', '{"provider":"whatsapp","displayName":"+4917000000"}', '2026-08-01'),
      ('c-old', 'e5', 'connected_account', 'a-gone', 'connected_account.deleted', '{"provider":"whatsapp","displayName":"+4917000000"}', '2026-08-20'),
      ('c-old', 'e6', 'connected_account', 'a-gone-no-event', 'connected_account.created', '{"provider":"linkedin","displayName":"Profile"}', '2026-08-02'),
      ('c-old', 'e7', 'connected_account', 'a-gone-no-event', 'connected_account.updated', '{"provider":"linkedin","displayName":"Profile"}', '2026-08-25');
  `);
}

async function ledger(client: Client) {
  const intervals = (
    await client.query<{
      subjectId: string;
      kind: string;
      startedAt: Date;
      endedAt: Date | null;
      startExact: boolean;
      endExact: boolean;
      who: string | null;
      roleName: string | null;
    }>(
      `SELECT "subjectId", kind::text, "startedAt", "endedAt", "startExact", "endExact",
              COALESCE(email, identifier) AS who, "roleName"
       FROM "BillingUsageInterval" ORDER BY kind, "subjectId"`,
    )
  ).rows;
  const workspaces = (
    await client.query<{ companyId: string; seatsRecordedFrom: Date | null; channelsRecordedFrom: Date | null }>(
      `SELECT "companyId", "seatsRecordedFrom", "channelsRecordedFrom" FROM "BillingUsageWorkspace" ORDER BY "companyId"`,
    )
  ).rows;

  return { intervals: new Map(intervals.map((row) => [row.subjectId, row])), workspaces };
}

describeDatabase("billing usage ledger migration", { timeout: 240_000 }, () => {
  it("backfills only what the data proves and flags inferred or estimated times", async () => {
    await withTemporaryDatabase(databaseUrl ?? "", async (client) => {
      const names = migrationNames();
      await applyMigrations(client, names.slice(0, names.indexOf(MIGRATION)));
      await client.query(
        `CREATE TABLE "_prisma_migrations" ("migration_name" TEXT NOT NULL, "finished_at" TIMESTAMPTZ)`,
      );
      await client.query(`INSERT INTO "_prisma_migrations" VALUES ($1, '2026-07-03T08:00:00Z')`, [MESSAGING_MIGRATION]);
      await legacyHistory(client);

      await applyMigrations(client, [MIGRATION]);
      const { intervals, workspaces } = await ledger(client);

      expect(intervals.get("u-reactivated")).toMatchObject({
        kind: "seat",
        startedAt: new Date("2026-09-10T00:00:00.000Z"),
        endedAt: null,
        startExact: false,
        roleName: "Admin",
      });
      expect(intervals.get("u-no-anchor")).toMatchObject({
        startedAt: new Date("2026-04-01T00:00:00.000Z"),
        startExact: false,
      });
      expect(intervals.has("u-inactive")).toBe(false);
      expect(intervals.has("u-pending")).toBe(false);

      expect(intervals.get("a-live")).toMatchObject({
        kind: "channel",
        endedAt: null,
        startExact: true,
        endExact: true,
      });
      expect(intervals.get("a-soft-no-event")).toMatchObject({
        endedAt: new Date("2026-09-15T00:00:00.000Z"),
        endExact: false,
        who: "soft@old.example.invalid",
      });
      expect(intervals.get("a-soft-event")).toMatchObject({
        endedAt: new Date("2026-09-22T00:00:00.000Z"),
        endExact: true,
      });
      expect(intervals.get("a-gone")).toMatchObject({
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        endedAt: new Date("2026-08-20T00:00:00.000Z"),
        endExact: true,
        who: "+4917000000",
      });
      expect(intervals.get("a-gone-no-event")).toMatchObject({
        endedAt: new Date("2026-08-25T00:00:00.000Z"),
        endExact: false,
      });

      const [newer, older] = workspaces;
      expect(newer).toMatchObject({ companyId: "c-new", channelsRecordedFrom: null });
      expect(newer.seatsRecordedFrom).toBeInstanceOf(Date);
      expect(older).toMatchObject({ companyId: "c-old", channelsRecordedFrom: new Date("2026-07-03T08:00:00.000Z") });
      expect(older.seatsRecordedFrom).toBeInstanceOf(Date);
    });
  });

  it("claims no channel history when the migration ledger is unavailable", async () => {
    await withTemporaryDatabase(databaseUrl ?? "", async (client) => {
      const names = migrationNames();
      await applyMigrations(client, names.slice(0, names.indexOf(MIGRATION)));
      await legacyHistory(client);

      await applyMigrations(client, [MIGRATION]);
      const { workspaces } = await ledger(client);

      for (const workspace of workspaces) expect(workspace.channelsRecordedFrom).toBeInstanceOf(Date);
    });
  });
});
