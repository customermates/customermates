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

async function http(member: Member | null, path: string, body?: unknown) {
  const { auth } = await import("@/core/auth/better-auth");
  const origin = await baseUrl();
  const response = await auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(member ? { cookie: member.cookie } : {}), origin, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return response.status;
}

type ServerCall = { status: number; code: string | null; body: Record<string, unknown> | null };

async function server(member: Member, run: (headers: Headers) => Promise<unknown>): Promise<ServerCall> {
  try {
    const body = (await run(new Headers({ cookie: member.cookie }))) as Record<string, unknown> | null;
    return { status: 200, code: null, body };
  } catch (error) {
    const failure = error as { statusCode?: unknown; body?: { code?: string } };
    if (typeof failure.statusCode !== "number") throw error;
    return { status: failure.statusCode, code: failure.body?.code ?? null, body: null };
  }
}

async function keys() {
  const { auth } = await import("@/core/auth/better-auth");
  return auth.api;
}

async function ownKey(member: Member) {
  const { auth } = await import("@/core/auth/better-auth");
  return auth.api.createApiKey({ body: { name: "Seeded", userId: member.authUserId } });
}

describeDatabase(
  "API key plugin endpoints stay server-side and enforce the API permission",
  { timeout: 120_000 },
  () => {
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

    it("refuses every key route over HTTP, even to an admin, so keys are only managed through the app", async () => {
      const seeded = await ownKey(admin);

      expect(await http(admin, "/api-key/create", { name: "Minted", expiresIn: 86_400 })).toBe(404);
      expect(await http(admin, "/api-key/update", { keyId: seeded.id, name: "Renamed" })).toBe(404);
      expect(await http(admin, "/api-key/delete", { keyId: seeded.id })).toBe(404);
      expect(await http(admin, "/api-key/list")).toBe(404);
      expect(await http(admin, `/api-key/get?id=${seeded.id}`)).toBe(404);
      expect(await http(null, "/api-key/create", { name: "Anonymous", userId: admin.authUserId })).toBe(404);

      const { prisma } = await db();
      expect(await prisma.apikey.count({ where: { referenceId: admin.authUserId } })).toBe(1);
    });

    it("refuses every key call to a member without the API permission", async () => {
      const api = await keys();
      const seeded = await ownKey(member);

      const calls = [
        await server(member, (headers) => api.createApiKey({ body: { name: "Minted", expiresIn: 86_400 }, headers })),
        await server(member, (headers) => api.updateApiKey({ body: { keyId: seeded.id, name: "Renamed" }, headers })),
        await server(member, (headers) => api.deleteApiKey({ body: { keyId: seeded.id }, headers })),
        await server(member, (headers) => api.listApiKeys({ headers })),
        await server(member, (headers) => api.getApiKey({ query: { id: seeded.id }, headers })),
      ];
      expect(calls.map((call) => call.status)).toEqual([403, 403, 403, 403, 403]);

      const { prisma } = await db();
      expect(await prisma.apikey.count({ where: { referenceId: member.authUserId } })).toBe(1);
    });

    it("refuses a user pending approval even with a full role", async () => {
      const api = await keys();
      const created = await server(pending, (headers) =>
        api.createApiKey({ body: { name: "Minted", expiresIn: 86_400 }, headers }),
      );

      expect(created).toMatchObject({ status: 403, code: "USER_INACTIVE" });
      expect((await server(pending, (headers) => api.listApiKeys({ headers }))).status).toBe(403);
    });

    it("grants each call only the action it needs", async () => {
      const api = await keys();
      const created = await server(creator, (headers) =>
        api.createApiKey({ body: { name: "Minted", expiresIn: 86_400 }, headers }),
      );
      expect(created.status).toBe(200);
      const keyId = created.body?.id as string;

      const denied = await server(creator, (headers) => api.deleteApiKey({ body: { keyId }, headers }));
      expect(denied).toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
      expect(
        (await server(creator, (headers) => api.updateApiKey({ body: { keyId, name: "Renamed" }, headers }))).status,
      ).toBe(403);
    });

    it("lets an admin manage keys and lists only the caller's own keys", async () => {
      const api = await keys();
      await ownKey(member);
      const created = await server(admin, (headers) =>
        api.createApiKey({ body: { name: "Admin key", expiresIn: 86_400 }, headers }),
      );
      expect(created.status).toBe(200);
      const keyId = created.body?.id as string;

      const listed = await server(admin, (headers) => api.listApiKeys({ headers }));
      expect(listed.status).toBe(200);
      const owners = (listed.body?.apiKeys as Array<{ referenceId: string }>).map((key) => key.referenceId);
      expect(new Set(owners)).toEqual(new Set([admin.authUserId]));

      expect(
        (await server(admin, (headers) => api.updateApiKey({ body: { keyId, name: "Renamed" }, headers }))).status,
      ).toBe(200);
      expect((await server(admin, (headers) => api.deleteApiKey({ body: { keyId }, headers }))).status).toBe(200);
    });
  },
);
