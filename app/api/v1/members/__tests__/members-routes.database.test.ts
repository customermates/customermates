import { randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { InitializeRecordModelService } from "@/features/records/initialize-record-model.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));
const sentEmails = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
      getAll: () => [],
      set: () => undefined,
      delete: () => undefined,
    }),
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
vi.mock("@/features/email/email.service", () => ({
  EmailService: class {
    send(args: { to: string; subject: string }) {
      sentEmails({ to: args.to, subject: args.subject });
      return Promise.resolve(true);
    }
  },
}));

import { POST as inviteMembers } from "../invite/route";
import { POST as updateMember } from "../update/route";
import { PATCH as updateProfile } from "../../users/me/route";
import { createTestRecordRepo } from "@/tests/helpers/record-repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Handler = (request: NextRequest) => Promise<Response>;

async function call(handler: Handler, apiKey: string, path: string, body: unknown, method = "POST") {
  const headers = new Headers({ "content-type": "application/json", "x-api-key": apiKey });
  requestContext.headers = headers;
  const response = await handler(
    new NextRequest(`http://localhost:4000/api/v1/${path}`, { method, headers, body: JSON.stringify(body) }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describeDatabase("member and profile REST routes", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const adminRoleId = randomUUID();
  const memberRoleId = randomUUID();
  const foreignRoleId = randomUUID();
  const adminUserId = randomUUID();
  const memberUserId = randomUUID();
  const targetUserId = randomUUID();
  const foreignUserId = randomUUID();
  const adminAuthUserId = randomUUID();
  const memberAuthUserId = randomUUID();
  const apiKeyIds = [randomUUID(), randomUUID()];
  const adminKey = randomUUID().replaceAll("-", "").repeat(2);
  const memberKey = randomUUID().replaceAll("-", "").repeat(2);
  const email = (label: string, id: string) => `rest-${label}-${id}@example.invalid`;
  const target = {
    email: email("target", targetUserId),
    firstName: "Target",
    lastName: "Member",
    country: "de",
    avatarUrl: null,
    roleId: memberRoleId,
    status: "active",
  };

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "Subscription" ("id", "companyId", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP), ($3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), companyId, randomUUID(), foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, \'REST admin\', TRUE, $2, CURRENT_TIMESTAMP), ($3, \'REST member\', FALSE, $2, CURRENT_TIMESTAMP), ($4, \'Foreign admin\', TRUE, $5, CURRENT_TIMESTAMP)',
      [adminRoleId, companyId, memberRoleId, foreignRoleId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action") VALUES ($1, $2, $3, \'users\', \'readAll\'), ($4, $2, $3, \'api\', \'readAll\')',
      [randomUUID(), memberRoleId, companyId, randomUUID()],
    );
    await client.query(
      "INSERT INTO \"User\" (\"id\", \"email\", \"firstName\", \"lastName\", \"companyId\", \"roleId\", \"status\", \"country\", \"updatedAt\") VALUES ($1, $2, 'REST', 'Admin', $3, $4, 'active', 'de', CURRENT_TIMESTAMP), ($5, $6, 'REST', 'Member', $3, $7, 'active', 'de', CURRENT_TIMESTAMP), ($8, $9, 'Target', 'Member', $3, $7, 'active', 'de', CURRENT_TIMESTAMP), ($10, $11, 'Foreign', 'Admin', $12, $13, 'active', 'de', CURRENT_TIMESTAMP)",
      [
        adminUserId,
        email("admin", adminUserId),
        companyId,
        adminRoleId,
        memberUserId,
        email("member", memberUserId),
        memberRoleId,
        targetUserId,
        target.email,
        foreignUserId,
        email("foreign", foreignUserId),
        foreignCompanyId,
        foreignRoleId,
      ],
    );
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'REST Admin\', $2, TRUE, $3, CURRENT_TIMESTAMP), ($4, \'REST Member\', $5, TRUE, $3, CURRENT_TIMESTAMP)',
      [adminAuthUserId, email("admin", adminUserId), companyId, memberAuthUserId, email("member", memberUserId)],
    );
    await client.query(
      'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, \'REST admin\', $2, $3, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($4, \'REST member\', $5, $6, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        apiKeyIds[0],
        await defaultKeyHasher(adminKey),
        adminAuthUserId,
        apiKeyIds[1],
        await defaultKeyHasher(memberKey),
        memberAuthUserId,
      ],
    );
    const owner = createMockUser({ id: adminUserId, companyId, roleId: adminRoleId });
    await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
  });

  beforeEach(() => {
    sentEmails.mockClear();
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Apikey" WHERE "id" = ANY($1)', [apiKeyIds]);
    await client.query('DELETE FROM "AuthUser" WHERE "id" = ANY($1)', [[adminAuthUserId, memberAuthUserId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  async function memberRow(id: string) {
    const result = await client.query<{ roleId: string | null; status: string }>(
      'SELECT "roleId", "status" FROM "User" WHERE "id" = $1',
      [id],
    );
    return result.rows[0];
  }

  it("invites each distinct address once through the stubbed mailer", async () => {
    const invited = await call(inviteMembers, adminKey, "members/invite", {
      emails: ["Invitee@Example.invalid", "invitee@example.invalid"],
    });

    expect(invited).toEqual({ status: 200, body: { sent: 1, failed: 0 } });
    expect(sentEmails).toHaveBeenCalledExactlyOnceWith({
      to: "invitee@example.invalid",
      subject: expect.any(String) as string,
    });
  });

  it("refuses invitations and role or status changes from a member without Users & Roles Manage", async () => {
    const invited = await call(inviteMembers, memberKey, "members/invite", { emails: ["blocked@example.invalid"] });
    expect(invited.status).toBe(403);
    expect(invited.body).toMatchObject({ error: { kind: "authorization" } });
    expect(sentEmails).not.toHaveBeenCalled();

    const promoted = await call(updateMember, memberKey, "members/update", { ...target, roleId: adminRoleId });
    expect(promoted.status).toBe(403);
    const deactivated = await call(updateMember, memberKey, "members/update", { ...target, status: "inactive" });
    expect(deactivated.status).toBe(403);
    expect(await memberRow(targetUserId)).toEqual({ roleId: memberRoleId, status: "active" });
  });

  it("changes a member's role and deactivates them with an admin key", async () => {
    const promoted = await call(updateMember, adminKey, "members/update", { ...target, roleId: adminRoleId });
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(200);
    expect(promoted.body).toMatchObject({ email: target.email, roleId: adminRoleId, status: "active" });
    expect(await memberRow(targetUserId)).toEqual({ roleId: adminRoleId, status: "active" });

    const deactivated = await call(updateMember, adminKey, "members/update", { ...target, status: "inactive" });
    expect(deactivated.status, JSON.stringify(deactivated.body)).toBe(200);
    expect(await memberRow(targetUserId)).toEqual({ roleId: memberRoleId, status: "inactive" });
  });

  it("updates a member named by userId with only the sent fields and answers 404 for an unknown role", async () => {
    const renamed = await call(updateMember, adminKey, "members/update", {
      userId: targetUserId,
      firstName: "Partial",
    });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body).toMatchObject({ email: target.email, firstName: "Partial", lastName: "Member" });

    const unknownRole = await call(updateMember, adminKey, "members/update", {
      userId: targetUserId,
      roleId: randomUUID(),
    });
    expect(unknownRole.status).toBe(404);
    expect(unknownRole.body).toMatchObject({
      error: { kind: "not_found", issues: [{ path: ["roleId"], customCode: "roleNotFound" }] },
    });
  });

  it("refuses the caller's own membership and another workspace's member", async () => {
    const self = await call(updateMember, adminKey, "members/update", {
      ...target,
      email: email("admin", adminUserId),
      roleId: memberRoleId,
    });
    expect(self.status).toBe(403);
    expect(self.body).toMatchObject({ error: { issues: [{ customCode: "userSelfAdminUpdateForbidden" }] } });

    const foreign = await call(updateMember, adminKey, "members/update", {
      ...target,
      email: email("foreign", foreignUserId),
      roleId: adminRoleId,
      status: "inactive",
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ error: { kind: "not_found", issues: [{ customCode: "userNotFound" }] } });
    expect(await memberRow(foreignUserId)).toEqual({ roleId: foreignRoleId, status: "active" });
    expect(await memberRow(adminUserId)).toEqual({ roleId: adminRoleId, status: "active" });
  });

  it("updates only the caller's own profile", async () => {
    const updated = await call(
      updateProfile,
      memberKey,
      "users/me",
      { firstName: "Renamed", country: "gb", theme: "dark", displayLanguage: "de", formattingLocale: "en" },
      "PATCH",
    );
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({
      firstName: "Renamed",
      lastName: "Member",
      country: "gb",
      theme: "dark",
      displayLanguage: "de",
      formattingLocale: "en",
    });

    const rows = await client.query<{ id: string; firstName: string; theme: string }>(
      'SELECT "id", "firstName", "theme" FROM "User" WHERE "id" = ANY($1)',
      [[memberUserId, adminUserId, foreignUserId]],
    );
    expect(new Map(rows.rows.map(({ id, ...row }) => [id, row]))).toEqual(
      new Map([
        [foreignUserId, { firstName: "Foreign", theme: "system" }],
        [adminUserId, { firstName: "REST", theme: "system" }],
        [memberUserId, { firstName: "Renamed", theme: "dark" }],
      ]),
    );

    const unsafe = await call(
      updateProfile,
      memberKey,
      "users/me",
      { avatarUrl: "ftp://example.invalid/a.png" },
      "PATCH",
    );
    expect(unsafe.status).toBe(400);
    expect(unsafe.body).toMatchObject({ error: { kind: "validation", issues: [{ path: ["avatarUrl"] }] } });
  });
});
