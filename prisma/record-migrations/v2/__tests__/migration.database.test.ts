import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import type { ClientBase } from "pg";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { prisma } from "@/prisma/db";
import { migrateLegacyWorkspace } from "../run";
import { presetId } from "@/features/records/crm-preset";
import { LEGACY_RELATIONSHIPS } from "../legacy-model";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const companies: string[] = [];
const clients: Client[] = [];
async function fixture() {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  await client.connect();
  clients.push(client);
  const source = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Admin", isSystemRole: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Local",
        lastName: "Test",
        status: "active",
        email: `${randomUUID()}@example.test`,
      },
    });
    const recordId = randomUUID();
    const timestamps = {
      createdAt: new Date("2025-02-03T10:11:12.345Z"),
      updatedAt: new Date("2026-04-05T06:07:08.901Z"),
    };
    await prisma.contact.create({
      data: {
        companyId: company.id,
        id: recordId,
        firstName: "Solo",
        lastName: "",
        notes: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A retained note" }],
            },
          ],
        },
        ...timestamps,
      },
    });
    await prisma.organization.create({
      data: {
        companyId: company.id,
        id: recordId,
        name: "Organization",
        ...timestamps,
      },
    });
    await prisma.deal.create({
      data: {
        companyId: company.id,
        id: recordId,
        name: "Deal",
        totalValue: 2600,
        totalQuantity: 5,
        weightedValue: 1560,
        ...timestamps,
      },
    });
    await prisma.service.create({
      data: {
        companyId: company.id,
        id: recordId,
        name: "A",
        amount: 1000,
        ...timestamps,
      },
    });
    const serviceB = await prisma.service.create({
      data: { companyId: company.id, name: "B", amount: 200 },
    });
    await prisma.task.create({
      data: {
        companyId: company.id,
        id: recordId,
        name: "Task",
        type: "custom",
        ...timestamps,
      },
    });
    const protectedTask = await prisma.task.create({
      data: {
        companyId: company.id,
        name: "Approve member",
        type: "userPendingAuthorization",
        relatedUserId: user.id,
      },
    });
    await prisma.serviceDeal.create({
      data: {
        companyId: company.id,
        id: recordId,
        dealId: recordId,
        serviceId: recordId,
        quantity: 2,
        ...timestamps,
      },
    });
    await prisma.serviceDeal.create({
      data: {
        companyId: company.id,
        dealId: recordId,
        serviceId: serviceB.id,
        quantity: 3,
      },
    });
    const fieldValues = [
      { type: "plain" as const, value: "Custom text", options: {} },
      {
        type: "currency" as const,
        value: "1234567890.1234567890123456789",
        options: { currency: "eur" },
      },
      {
        type: "date" as const,
        value: "2026-09-28T12:34:56.123456+02:00",
        options: {},
      },
      {
        type: "dateTime" as const,
        value: "2026-09-28T12:34:56.123456+02:00",
        options: {},
      },
      {
        type: "dateRange" as const,
        value: "2026-09-01,2026-09-30",
        options: {},
      },
      {
        type: "dateTimeRange" as const,
        value: "2026-09-28T12:34:56.123456+02:00,2026-09-28T16:34:56.654321+02:00",
        options: {},
      },
      {
        type: "email" as const,
        value: "one@example.test, two@example.test",
        options: { allowMultiple: true },
      },
      {
        type: "phone" as const,
        value: "+4915123456789,+4915123456780",
        options: { allowMultiple: true },
      },
      {
        type: "link" as const,
        value: "https://example.test/one,https://example.test/two",
        options: { allowMultiple: true },
      },
      {
        type: "singleSelect" as const,
        value: "stage",
        options: {
          options: [
            {
              value: "stage",
              label: "Proposal",
              color: "blue",
              index: 0,
              isDefault: true,
              weight: 60,
            },
            {
              value: "zero",
              label: "Zero",
              color: "gray",
              index: 1,
              isDefault: false,
              weight: 0,
            },
            {
              value: "missing",
              label: "No probability",
              color: "gray",
              index: 2,
              isDefault: false,
            },
          ],
        },
      },
    ];
    const fieldIds: Record<string, string> = {};
    for (const field of fieldValues) {
      const column = await prisma.customColumn.create({
        data: {
          companyId: company.id,
          label: field.type,
          type: field.type,
          entityType: "deal",
          options: field.options,
          ...timestamps,
        },
      });
      fieldIds[field.type] = column.id;
      await prisma.customFieldValue.create({
        data: {
          companyId: company.id,
          columnId: column.id,
          type: field.type,
          entityType: "deal",
          dealId: recordId,
          value: field.value,
          ...timestamps,
        },
      });
      if (field.type === "singleSelect") {
        await prisma.company.update({
          where: { id: company.id },
          data: { dealWeightingColumnId: column.id },
        });
      }
    }
    return {
      companyId: company.id,
      userId: user.id,
      roleId: role.id,
      recordId,
      fieldIds,
      protectedId: protectedTask.id,
      timestamps,
    };
  });
  const relationId = randomUUID();
  for (const relation of LEGACY_RELATIONSHIPS) {
    await client.query(
      `INSERT INTO "${relation.table}" (id, "companyId", "${relation.source}Id", "${relation.target}Id", "createdAt", "updatedAt") VALUES ($1, $2, $3, $3, NOW(), NOW())`,
      [relationId, source.companyId, source.recordId],
    );
  }
  for (const [type, table] of [
    ["contact", "Contact"],
    ["organization", "Organization"],
    ["deal", "Deal"],
    ["service", "Service"],
    ["task", "Task"],
  ]) {
    await client.query(
      `INSERT INTO "${table}User" (id, "companyId", "${type}Id", "userId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [relationId, source.companyId, source.recordId, source.userId],
    );
    await client.query(
      'INSERT INTO "RolePermission" (id, "companyId", "roleId", resource, action) VALUES ($1, $2, $3, $4, \'readOwn\')',
      [randomUUID(), source.companyId, source.roleId, `${type}s`],
    );
  }
  return {
    ...source,
    client,
    id: (key: string) => presetId(source.companyId, key),
  };
}

describeDatabase("legacy record migration", { timeout: 30000 }, () => {
  afterAll(async () => {
    for (const client of clients) await client.end();
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
    await prisma.$disconnect();
  });

  it("preserves colliding IDs, every custom value type, links, dates, notes, protected tasks and exact totals", async () => {
    const f = await fixture();
    const identityId = randomUUID();
    await f.client.query(
      `INSERT INTO "ContactIdentifier" (id, "companyId", "contactId", provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'linkedin', 'linkedin', 'person', 'provider-person', 'Person', 'https://linkedin.com/in/person', '2021-02-03T04:05:06.789Z', '2022-03-04T05:06:07.890Z')`,
      [identityId, f.companyId, f.recordId],
    );
    const first = await migrateLegacyWorkspace(f.client, f.companyId, "backfill");
    expect(first, JSON.stringify(first)).toMatchObject({
      ok: true,
      reconciliation: { valid: true, issues: [] },
    });
    const identity = (
      await f.client.query(
        'SELECT *, "createdAt" AT TIME ZONE \'UTC\' AS "createdAt", "updatedAt" AT TIME ZONE \'UTC\' AS "updatedAt" FROM "RecordIdentity" WHERE "companyId" = $1 AND id = $2',
        [f.companyId, identityId],
      )
    ).rows[0];
    expect(identity).toMatchObject({
      id: identityId,
      typeId: f.id("contact"),
      recordId: f.recordId,
      value: "person",
      messagingId: "provider-person",
      displayName: "Person",
      profileUrl: "https://linkedin.com/in/person",
      createdAt: new Date("2021-02-03T04:05:06.789Z"),
      updatedAt: new Date("2022-03-04T05:06:07.890Z"),
    });
    expect(
      (
        await f.client.query('SELECT value FROM "RecordIdentityKey" WHERE "companyId" = $1 ORDER BY value', [
          f.companyId,
        ])
      ).rows,
    ).toEqual([{ value: "person" }, { value: "provider-person" }]);
    expect(
      (
        await f.client.query('SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = $1 AND id = $2', [
          f.companyId,
          f.recordId,
        ])
      ).rows[0].count,
    ).toBe("6");
    const values = (
      await f.client.query(
        'SELECT "fieldId", "textValue", "decimalValue"::text, "lexicalValue" FROM "RecordValue" WHERE "companyId" = $1 AND "recordId" = $2',
        [f.companyId, f.recordId],
      )
    ).rows;
    const value = (fieldId: string) => values.find((row) => row.fieldId === fieldId);
    expect(value(f.id("contact.name"))?.textValue).toBe("Solo");
    expect(value(f.id("deal.totalValue"))?.decimalValue).toBe("2600.000000000000000000000000000000");
    expect(value(f.id("deal.weightedValue"))?.decimalValue).toBe("1560.000000000000000000000000000000");
    expect(value(f.fieldIds.currency)?.decimalValue).toBe("1234567890.123456789012345678900000000000");
    expect(value(f.fieldIds.dateTime)?.lexicalValue).toBe("2026-09-28T12:34:56.123456+02:00");
    const range = await f.client.query(
      `SELECT to_char("rangeStart", 'YYYY-MM-DD"T"HH24:MI:SS.US') AS start,
        to_char("rangeEnd", 'YYYY-MM-DD"T"HH24:MI:SS.US') AS "end", "jsonValue"
        FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2`,
      [f.companyId, f.fieldIds.dateTimeRange],
    );
    expect(range.rows).toEqual([
      {
        start: "2026-09-28T10:34:56.123456",
        end: "2026-09-28T14:34:56.654321",
        jsonValue: { start: "2026-09-28T12:34:56.123456+02:00", end: "2026-09-28T16:34:56.654321+02:00" },
      },
    ]);
    expect(
      (
        await f.client.query(
          'SELECT "protectedKind", "systemData" FROM "CrmRecord" WHERE "companyId" = $1 AND id = $2',
          [f.companyId, f.protectedId],
        )
      ).rows[0],
    ).toMatchObject({
      protectedKind: "membershipAuthorization",
      systemData: { relatedUserId: f.userId },
    });
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "RecordEvent" WHERE "companyId" = $1', [f.companyId])).rows[0].count,
    ).toBe("0");
    const repeated = await migrateLegacyWorkspace(f.client, f.companyId, "backfill");
    expect(repeated).toMatchObject({ ok: true, resumed: true, calculated: 0 });
    expect(
      (
        await f.client.query(
          'SELECT *, "createdAt" AT TIME ZONE \'UTC\' AS "createdAt", "updatedAt" AT TIME ZONE \'UTC\' AS "updatedAt" FROM "RecordIdentity" WHERE "companyId" = $1 AND id = $2',
          [f.companyId, identityId],
        )
      ).rows[0],
    ).toEqual(identity);
  });

  it("blocks cross-column identifier collisions instead of silently choosing an owner", async () => {
    const f = await fixture();
    const ids = [randomUUID(), randomUUID()];
    await f.client.query(
      `INSERT INTO "ContactIdentifier" (id, "companyId", "contactId", provider, "channelClass", value, "messagingId", "updatedAt")
       VALUES ($1, $3, $4, 'linkedin', 'linkedin', 'first', 'second', NOW()), ($2, $3, $4, 'linkedin', 'linkedin', 'second', NULL, NOW())`,
      [...ids, f.companyId, f.recordId],
    );
    const result = await migrateLegacyWorkspace(f.client, f.companyId, "backfill");
    expect(result).toMatchObject({
      ok: false,
      preflight: {
        issues: expect.arrayContaining(
          ids.map((id) => ({ table: "ContactIdentifier", id, field: "value", code: "duplicate_identity_key" })),
        ),
      },
    });
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "RecordIdentity" WHERE "companyId" = $1', [f.companyId])).rows[0]
        .count,
    ).toBe("0");
  });

  it("reports noncanonical identity data without modifying the original value", async () => {
    const f = await fixture();
    const id = randomUUID();
    await f.client.query(
      `INSERT INTO "ContactIdentifier" (id, "companyId", "contactId", provider, "channelClass", value, "updatedAt") VALUES ($1, $2, $3, 'mail', 'email', 'Person@Example.test', NOW())`,
      [id, f.companyId, f.recordId],
    );
    expect(await migrateLegacyWorkspace(f.client, f.companyId, "backfill")).toMatchObject({
      ok: false,
      preflight: { issues: [{ table: "ContactIdentifier", id, field: "value", code: "noncanonical_identity_value" }] },
    });
    expect((await f.client.query('SELECT value FROM "ContactIdentifier" WHERE id = $1', [id])).rows[0].value).toBe(
      "Person@Example.test",
    );
  });

  it("detects altered identity keys during reconciliation", async () => {
    const f = await fixture();
    const id = randomUUID();
    await f.client.query(
      `INSERT INTO "ContactIdentifier" (id, "companyId", "contactId", provider, "channelClass", value, "updatedAt") VALUES ($1, $2, $3, 'mail', 'email', 'person@example.test', NOW())`,
      [id, f.companyId, f.recordId],
    );
    expect(await migrateLegacyWorkspace(f.client, f.companyId, "backfill")).toMatchObject({ ok: true });
    await f.client.query('DELETE FROM "RecordIdentityKey" WHERE "companyId" = $1', [f.companyId]);
    expect(await migrateLegacyWorkspace(f.client, f.companyId, "reconcile")).toMatchObject({
      ok: false,
      reconciliation: { issues: [{ table: "ContactIdentifier", id, field: "keys", code: "reconciliation_mismatch" }] },
    });
  });

  it("reports malformed values before writing any generic records", async () => {
    const f = await fixture();
    await f.client.query('UPDATE "CustomFieldValue" SET value = $1 WHERE "companyId" = $2 AND "columnId" = $3', [
      "1e-31",
      f.companyId,
      f.fieldIds.currency,
    ]);
    const result = await migrateLegacyWorkspace(f.client, f.companyId, "backfill");
    expect(result).toMatchObject({
      ok: false,
      preflight: {
        issues: [
          {
            table: "CustomFieldValue",
            field: "value",
            code: "invalid_typed_value",
          },
        ],
      },
    });
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "RecordSchemaState" WHERE "companyId" = $1', [f.companyId])).rows[0]
        .count,
    ).toBe("0");
  });

  it("rolls back interrupted work and can reconcile a retry after an ambiguous committed response", async () => {
    const f = await fixture();
    const beforeCommit = new Proxy(f.client, {
      get(target, key) {
        if (key !== "query") return Reflect.get(target, key);
        return async (...args: unknown[]) => {
          if (args[0] === "COMMIT") throw new Error("Simulated interrupted publication");
          return await Reflect.apply(target.query.bind(target), target, args);
        };
      },
    });
    await expect(migrateLegacyWorkspace(beforeCommit as ClientBase, f.companyId, "backfill")).rejects.toThrow(
      "Simulated interrupted publication",
    );
    expect(
      (await f.client.query('SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = $1', [f.companyId])).rows[0].count,
    ).toBe("0");
    const afterCommit = new Proxy(f.client, {
      get(target, key) {
        if (key !== "query") return Reflect.get(target, key);
        return async (...args: unknown[]) => {
          const result = await Reflect.apply(target.query.bind(target), target, args);
          if (args[0] === "COMMIT") throw new Error("Simulated lost response");
          return result;
        };
      },
    });
    await expect(migrateLegacyWorkspace(afterCommit as ClientBase, f.companyId, "backfill")).rejects.toThrow(
      "Simulated lost response",
    );
    expect(await migrateLegacyWorkspace(f.client, f.companyId, "reconcile")).toMatchObject({ ok: true, resumed: true });
  });
});
