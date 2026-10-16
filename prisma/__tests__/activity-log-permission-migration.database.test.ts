import type { Client } from "pg";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createLegacyMigrationDatabase, deployMigrations } from "@/tests/helpers/legacy-migration-database";

const MIGRATION = "20261016120000_rename_audit_log_permission";
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];

type Permission = { id: string; resource: string; action: string };

async function rows<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows as T[];
}

function roleSnapshot(id: string, name: string, permissions: Permission[]) {
  return {
    id,
    name,
    description: null,
    isSystemRole: false,
    createdAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-12T09:30:00.000Z",
    permissions,
    recordGrants: [{ typeId: randomUUID(), actions: ["readAll"] }],
  };
}

function renamed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('"resource":"auditLog"', '"resource":"activityLog"')) as T;
}

describeDatabase("activity log permission migration", { timeout: 240000 }, () => {
  afterAll(async () => {
    for (const database of databases) await database.close();
  });

  it("renames the audit log permission in place and in stored role snapshots", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl, false);
    databases.push(database);
    const { client } = database;
    expect((await deployMigrations(database.url, (name) => name < MIGRATION)).code).toBe(0);

    const companyId = randomUUID();
    const roleId = randomUUID();
    const deletedRoleId = randomUUID();
    const userId = randomUUID();
    const activity: Permission = { id: randomUUID(), resource: "auditLog", action: "readAll" };
    const users: Permission = { id: randomUUID(), resource: "users", action: "readAll" };
    await client.query('INSERT INTO "Company" (id, "updatedAt") VALUES ($1, NOW())', [companyId]);
    await client.query(
      'INSERT INTO "UserRole" (id, name, "companyId", "updatedAt") VALUES ($1, $2, $3, NOW()), ($4, $5, $3, NOW())',
      [roleId, "Auditors", companyId, deletedRoleId, "Retired"],
    );
    await client.query(
      'INSERT INTO "RolePermission" (id, "roleId", "companyId", resource, action) VALUES ($1, $2, $3, $4, $5), ($6, $2, $3, $7, $8)',
      [activity.id, roleId, companyId, activity.resource, activity.action, users.id, users.resource, users.action],
    );

    const role = roleSnapshot(roleId, "Auditors", [activity, users]);
    const events = {
      created: { kind: "role.created", subjectKind: "role", payload: role },
      updated: {
        kind: "role.updated",
        subjectKind: "role",
        payload: {
          role,
          changes: {
            name: { previous: "Viewers", current: "Auditors" },
            permissions: { previous: [{ ...activity, action: "readOwn" }], current: [activity] },
          },
        },
      },
      nameChangeOnly: {
        kind: "role.updated",
        subjectKind: "role",
        payload: {
          role: roleSnapshot(roleId, "Auditors", [users]),
          changes: { name: { previous: "A", current: "B" } },
        },
      },
      deleted: {
        kind: "role.deleted",
        subjectKind: "role",
        payload: roleSnapshot(deletedRoleId, "auditLog", [
          { id: randomUUID(), resource: "auditLog", action: "readAll" },
        ]),
      },
      record: {
        kind: "record.updated",
        subjectKind: "record",
        payload: { changes: { [randomUUID()]: { previous: null, current: { resource: "auditLog" } } } },
      },
    };
    const eventIds = Object.fromEntries(Object.keys(events).map((key) => [key, randomUUID()]));
    for (const [key, event] of Object.entries(events)) {
      await client.query(
        'INSERT INTO "EventLog" ("companyId", id, "subjectKind", "subjectId", "actorId", kind, payload, "deliveredAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
        [companyId, eventIds[key], event.subjectKind, roleId, userId, event.kind, JSON.stringify(event.payload)],
      );
    }

    const receipts = {
      roleSave: { role, schemaRevision: 4 },
      roleDelete: deletedRoleId,
      record: { record: { id: randomUUID(), values: { resource: "auditLog" } }, schemaRevision: 5 },
    };
    for (const [key, result] of Object.entries(receipts)) {
      await client.query(
        'INSERT INTO "RecordMutationReceipt" ("companyId", "userId", "idempotencyKey", "requestHash", result) VALUES ($1, $2, $3, $4, $5)',
        [companyId, userId, key, "hash", JSON.stringify(result)],
      );
    }

    const deployed = await deployMigrations(database.url);
    expect(deployed.code).toBe(0);
    expect(deployed.output).toContain(MIGRATION);

    expect(
      (await rows<{ value: string }>(client, 'SELECT unnest(enum_range(NULL::"Resource"))::text AS value')).map(
        ({ value }) => value,
      ),
    ).toEqual(["dataModel", "users", "company", "api", "activityLog", "inboxMessages", "wiki", "routines"]);
    expect(
      await rows(
        client,
        'SELECT id, resource::text AS resource, action::text AS action FROM "RolePermission" WHERE "roleId" = $1 ORDER BY resource::text',
        [roleId],
      ),
    ).toEqual([{ ...activity, resource: "activityLog" }, users]);
    await expect(client.query(`SELECT 'auditLog'::"Resource"`)).rejects.toThrow(/invalid input value for enum/);

    const payloads = Object.fromEntries(
      (
        await rows<{ id: string; payload: unknown }>(
          client,
          'SELECT id, payload FROM "EventLog" WHERE "companyId" = $1',
          [companyId],
        )
      ).map(({ id, payload }) => [id, payload]),
    );
    for (const [key, event] of Object.entries(events)) {
      expect(payloads[eventIds[key]], key).toEqual(
        event.subjectKind === "role" ? renamed(event.payload) : event.payload,
      );
    }
    expect(JSON.stringify(payloads[eventIds.updated])).not.toContain("auditLog");
    expect(payloads[eventIds.record]).toEqual(events.record.payload);

    const results = Object.fromEntries(
      (
        await rows<{ idempotencyKey: string; result: unknown }>(
          client,
          'SELECT "idempotencyKey", result FROM "RecordMutationReceipt" WHERE "companyId" = $1',
          [companyId],
        )
      ).map(({ idempotencyKey, result }) => [idempotencyKey, result]),
    );
    expect(results).toEqual({ ...receipts, roleSave: renamed(receipts.roleSave) });
    expect(await rows(client, `SELECT to_regprocedure('"renameAuditLogResource"(jsonb)')::text AS helper`)).toEqual([
      { helper: null },
    ]);
  });
});
