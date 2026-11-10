import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createApiKeyTenant } from "@/tests/helpers/api-key-tenant-fixture";
import { createMockUser } from "@/tests/helpers/mock-user";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({ get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: async (namespace?: string) => {
    const [{ createTranslator }, { default: messages }] = await Promise.all([
      import("next-intl"),
      import("@/i18n/locales/en.json"),
    ]);
    return createTranslator({ locale: "en", messages, namespace: namespace as never });
  },
}));

import { POST as updateMember } from "../update/route";
import { POST as removeMember } from "../remove/route";
import { POST as saveRole } from "../../roles/save/route";
import { POST as applyModel } from "../../model/apply/route";
import { POST as createWebhook } from "../../webhooks/route";
import { initializeStarterRecordModel } from "@/tests/helpers/record-repository";
import { bindFixtureCredentials } from "@/tests/helpers/bind-fixture-credentials";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Handler = (request: NextRequest) => Promise<Response>;

async function call(handler: Handler, apiKey: string, path: string, body: unknown) {
  const headers = new Headers({ "content-type": "application/json", "x-api-key": apiKey });
  requestContext.headers = headers;
  const response = await handler(
    new NextRequest(`http://localhost:4000/api/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const refused = { error: { kind: "authorization", issues: [{ customCode: "roleExceedsOwnPermissions" }] } };

describeDatabase("role assignment and role definitions stay within the caller's own permissions", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let admin: { userId: string; apiKey: string };
  let lead: { userId: string; apiKey: string };
  let attacker: { userId: string; apiKey: string };
  let secondAdmin: { userId: string; apiKey: string };
  let roles: { admin: string; lead: string; attacker: string };
  let leadType: string;
  let otherType: string;

  const revision = async () =>
    (
      await client.query<{ revision: number }>('SELECT "revision" FROM "RecordSchemaState" WHERE "companyId" = $1', [
        tenant.companyId,
      ])
    ).rows[0].revision;
  const roleOf = async (userId: string) =>
    (await client.query<{ roleId: string }>('SELECT "roleId" FROM "User" WHERE "id" = $1', [userId])).rows[0].roleId;
  const role = (name: string, permissions: unknown[], recordGrants: unknown[] = []) =>
    revision().then((expectedRevision) => ({
      name,
      description: "d",
      permissions,
      recordGrants,
      expectedRevision,
      idempotencyKey: `k-${randomUUID()}`,
    }));
  const webhook = { url: "https://hooks.example.com/escalation", events: ["messaging.message.received"] };

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [
      { label: "escalation-admin", systemRole: true },
      {
        label: "escalation-lead",
        systemRole: false,
        permissions: [
          ["users", "create"],
          ["users", "update"],
          ["users", "readAll"],
          ["api", "readAll"],
        ],
      },
      { label: "escalation-attacker", systemRole: false, permissions: [["api", "readAll"]] },
      { label: "escalation-second-admin", systemRole: false },
    ]);
    [admin, lead, attacker, secondAdmin] = tenant.members;
    await client.query(
      'INSERT INTO "Subscription" ("id", "companyId", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)',
      [randomUUID(), tenant.companyId],
    );
    roles = {
      admin: await roleOf(admin.userId),
      lead: await roleOf(lead.userId),
      attacker: await roleOf(attacker.userId),
    };
    await client.query('UPDATE "User" SET "roleId" = $1 WHERE "id" = $2', [roles.admin, secondAdmin.userId]);
    await runWithTenant(createMockUser({ id: admin.userId, companyId: tenant.companyId, roleId: roles.admin }), () =>
      initializeStarterRecordModel(),
    );
    await bindFixtureCredentials(client, [tenant.companyId]);
    const types = await client.query<{ id: string }>(
      'SELECT "id" FROM "RecordTypeDefinition" WHERE "companyId" = $1 AND "definition"->>\'parentRelationshipId\' IS NULL AND NOT "embedded" AND NOT "archived" ORDER BY "position" LIMIT 2',
      [tenant.companyId],
    );
    [leadType, otherType] = types.rows.map((row) => row.id);
    await client.query(
      'INSERT INTO "RecordTypeGrant" ("companyId", "typeId", "roleId", "actions") VALUES ($1, $2, $3, ARRAY[\'readAll\']::"Action"[])',
      [tenant.companyId, leadType, roles.lead],
    );
  });

  afterAll(async () => {
    await tenant?.remove();
    await client.end();
  });

  it("refuses a Lead who promotes another member to the Admin role, and the member stays without webhook access", async () => {
    const promoted = await call(updateMember, lead.apiKey, "members/update", {
      userId: attacker.userId,
      status: "active",
      roleId: roles.admin,
    });
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(403);
    expect(promoted.body).toMatchObject(refused);
    expect(await roleOf(attacker.userId)).toBe(roles.attacker);

    const hook = await call(createWebhook, attacker.apiKey, "webhooks", webhook);
    expect(hook.status).toBe(403);
  });

  it("refuses a Lead who saves a role with a permission or record grant the Lead does not hold", async () => {
    const company = await call(saveRole, lead.apiKey, "roles/save", {
      ...(await role("Xlead", [{ resource: "company", actions: ["update"] }])),
    });
    expect(company.status, JSON.stringify(company.body)).toBe(403);
    expect(company.body).toMatchObject(refused);

    const records = await call(saveRole, lead.apiKey, "roles/save", {
      ...(await role("Xlead records", [], [{ typeId: otherType, actions: ["readAll"] }])),
    });
    expect(records.status, JSON.stringify(records.body)).toBe(403);
    expect(records.body).toMatchObject(refused);

    const wider = await call(saveRole, lead.apiKey, "roles/save", {
      ...(await role("Xlead update", [], [{ typeId: leadType, actions: ["readAll", "update"] }])),
    });
    expect(wider.status, JSON.stringify(wider.body)).toBe(403);

    const stored = await client.query('SELECT 1 FROM "UserRole" WHERE "companyId" = $1 AND "name" LIKE \'Xlead%\'', [
      tenant.companyId,
    ]);
    expect(stored.rowCount).toBe(0);
  });

  it("refuses a Lead who widens another role's record grants through the record model", async () => {
    const granted = await call(applyModel, lead.apiKey, "model/apply", {
      expectedRevision: await revision(),
      idempotencyKey: `k-${randomUUID()}`,
      operations: [
        {
          operation: "setTypeGrants",
          typeId: otherType,
          grants: [{ roleId: roles.attacker, actions: ["readAll", "update"] }],
        },
      ],
    });
    expect(granted.status, JSON.stringify(granted.body)).toBe(403);
    expect(granted.body).toMatchObject(refused);
    const grants = await client.query('SELECT 1 FROM "RecordTypeGrant" WHERE "companyId" = $1 AND "roleId" = $2', [
      tenant.companyId,
      roles.attacker,
    ]);
    expect(grants.rowCount).toBe(0);
  });

  it("refuses a Lead who removes an Admin from the workspace", async () => {
    const removed = await call(removeMember, lead.apiKey, "members/remove", { userId: secondAdmin.userId });
    expect(removed.status, JSON.stringify(removed.body)).toBe(403);
    expect(removed.body).toMatchObject(refused);
    const kept = await client.query('SELECT "leftAt" FROM "User" WHERE "id" = $1', [secondAdmin.userId]);
    expect(kept.rows[0]).toEqual({ leftAt: null });
  });

  it("lets a Lead define and assign a role within the Lead's own permissions", async () => {
    const saved = await call(saveRole, lead.apiKey, "roles/save", {
      ...(await role(
        "Reader",
        [
          { resource: "users", actions: ["readAll"] },
          { resource: "api", actions: ["readAll"] },
        ],
        [{ typeId: leadType, actions: ["readOwn", "readAll"] }],
      )),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const readerId = (saved.body.role as { id: string }).id;

    const assigned = await call(updateMember, lead.apiKey, "members/update", {
      userId: attacker.userId,
      status: "active",
      roleId: readerId,
    });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    expect(await roleOf(attacker.userId)).toBe(readerId);
    expect((await call(createWebhook, attacker.apiKey, "webhooks", webhook)).status).toBe(403);
  });

  it("leaves an Admin free to define any role and to assign the Admin role", async () => {
    const saved = await call(saveRole, admin.apiKey, "roles/save", {
      ...(await role("Company editor", [{ resource: "company", actions: ["update"] }])),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);

    const promoted = await call(updateMember, admin.apiKey, "members/update", {
      userId: attacker.userId,
      status: "active",
      roleId: roles.admin,
    });
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(200);
    expect(await roleOf(attacker.userId)).toBe(roles.admin);
  });
});
