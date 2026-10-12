import { randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Member = { authUserId: string; cookie: string };

const companyId = randomUUID();
const authUserIds: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
  return { prisma, runWithoutTenant };
}

async function baseUrl() {
  const { env } = await import("@/env");
  return env.BASE_URL;
}

async function seedMember(
  label: string,
  status: "active" | "pendingAuthorization",
  role: { isSystemRole: boolean; actions: Array<"create" | "update" | "delete" | "readAll"> },
): Promise<Member> {
  const { prisma, runWithoutTenant } = await db();
  const { auth } = await import("@/core/auth/better-auth");
  const email = `${label}-${randomUUID()}@example.test`;
  const authUserId = randomUUID();
  const token = randomUUID().replaceAll("-", "");

  await runWithoutTenant(async () => {
    const createdRole = await prisma.userRole.create({
      data: {
        name: `${label} ${randomUUID()}`,
        isSystemRole: role.isSystemRole,
        companyId,
        permissions: { create: role.actions.map((action) => ({ companyId, resource: "api" as const, action })) },
      },
    });
    await prisma.user.create({
      data: { email, firstName: label, lastName: "Keys", companyId, roleId: createdRole.id, status },
    });
    await prisma.authUser.create({ data: { id: authUserId, email, name: label, emailVerified: true, companyId } });
    await prisma.authSession.create({
      data: { id: randomUUID(), token, userId: authUserId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
  });
  authUserIds.push(authUserId);

  const secret = (await auth.$context).secret;
  const cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];

  return { authUserId, cookie };
}

async function call(member: Member, path: string, body?: unknown) {
  const { auth } = await import("@/core/auth/better-auth");
  const origin = await baseUrl();
  const response = await auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie: member.cookie, origin, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

async function ownKey(member: Member) {
  const { auth } = await import("@/core/auth/better-auth");
  return auth.api.createApiKey({ body: { name: "Seeded", userId: member.authUserId } });
}

describeDatabase("API key plugin routes enforce the API permission", { timeout: 120_000 }, () => {
  let admin: Member;
  let member: Member;
  let creator: Member;
  let pending: Member;

  beforeAll(async () => {
    const { prisma, runWithoutTenant } = await db();
    await runWithoutTenant(() => prisma.company.create({ data: { id: companyId } }));
    admin = await seedMember("admin", "active", { isSystemRole: true, actions: [] });
    member = await seedMember("member", "active", { isSystemRole: false, actions: [] });
    creator = await seedMember("creator", "active", { isSystemRole: false, actions: ["create", "readAll"] });
    pending = await seedMember("pending", "pendingAuthorization", { isSystemRole: true, actions: [] });
  });

  afterAll(async () => {
    const { prisma, runWithoutTenant } = await db();
    await prisma.apikey.deleteMany({ where: { referenceId: { in: authUserIds } } });
    await prisma.authUser.deleteMany({ where: { id: { in: authUserIds } } });
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
  });

  it("refuses every key route to a member without the API permission", async () => {
    const seeded = await ownKey(member);

    expect((await call(member, "/api-key/create", { name: "Minted", expiresIn: 86_400 })).status).toBe(403);
    expect((await call(member, "/api-key/update", { keyId: seeded.id, name: "Renamed" })).status).toBe(403);
    expect((await call(member, "/api-key/delete", { keyId: seeded.id })).status).toBe(403);
    expect((await call(member, "/api-key/list")).status).toBe(403);
    expect((await call(member, `/api-key/get?id=${seeded.id}`)).status).toBe(403);

    const { prisma } = await db();
    expect(await prisma.apikey.count({ where: { referenceId: member.authUserId } })).toBe(1);
  });

  it("refuses a user pending approval even with a full role", async () => {
    const created = await call(pending, "/api-key/create", { name: "Minted", expiresIn: 86_400 });

    expect(created.status).toBe(403);
    expect(created.body?.code).toBe("USER_INACTIVE");
    expect((await call(pending, "/api-key/list")).status).toBe(403);
  });

  it("grants each route only the action it needs", async () => {
    const created = await call(creator, "/api-key/create", { name: "Minted", expiresIn: 86_400 });
    expect(created.status).toBe(200);

    const denied = await call(creator, "/api-key/delete", { keyId: created.body?.id });
    expect(denied.status).toBe(403);
    expect(denied.body?.code).toBe("PERMISSION_DENIED");
    expect((await call(creator, "/api-key/update", { keyId: created.body?.id, name: "Renamed" })).status).toBe(403);
  });

  it("lets an admin manage keys and lists only the caller's own keys", async () => {
    await ownKey(member);
    const created = await call(admin, "/api-key/create", { name: "Admin key", expiresIn: 86_400 });
    expect(created.status).toBe(200);

    const listed = await call(admin, "/api-key/list");
    expect(listed.status).toBe(200);
    const ids = (listed.body?.apiKeys as Array<{ id: string; referenceId: string }>).map((key) => key.referenceId);
    expect(new Set(ids)).toEqual(new Set([admin.authUserId]));

    expect((await call(admin, "/api-key/update", { keyId: created.body?.id, name: "Renamed" })).status).toBe(200);
    expect((await call(admin, "/api-key/delete", { keyId: created.body?.id })).status).toBe(200);
  });

  it("refuses a key route without a signed-in session", async () => {
    const { auth } = await import("@/core/auth/better-auth");
    const origin = await baseUrl();
    const response = await auth.handler(
      new Request(`${origin}/api/auth/api-key/create`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ name: "Anonymous", userId: admin.authUserId }),
      }),
    );

    expect(response.status).toBe(401);
  });
});
