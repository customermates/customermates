import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const ORIGIN = "http://localhost:4000";
const PASSWORD = "OriginalHorse123!";
const NEW_PASSWORD = "ReplacementHorse123!";
const createdUserIds: string[] = [];
const createdClientIds: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function handler() {
  const { auth } = await import("@/core/auth/better-auth");
  return auth.handler;
}

async function seedVerifiedUser() {
  const prisma = await db();
  const { auth } = await import("@/core/auth/better-auth");
  const context = await auth.$context;
  const id = randomUUID();
  const email = `password-${id}@example.test`;
  const clientId = `client-${id}`;
  const createdAt = new Date();

  await prisma.authUser.create({
    data: {
      id,
      email,
      name: email,
      emailVerified: true,
      createdAt,
      updatedAt: createdAt,
    },
  });
  createdUserIds.push(id);
  await prisma.authAccount.create({
    data: {
      id: randomUUID(),
      userId: id,
      providerId: "credential",
      accountId: id,
      password: await context.password.hash(PASSWORD),
      createdAt,
      updatedAt: createdAt,
    },
  });
  await prisma.apikey.create({
    data: {
      id: randomUUID(),
      key: `key-${id}`,
      referenceId: id,
      createdAt,
      updatedAt: createdAt,
    },
  });
  await prisma.oauthApplication.create({
    data: {
      id: randomUUID(),
      name: "Password client",
      clientId,
      redirectUrls: "",
      type: "public",
    },
  });
  createdClientIds.push(clientId);
  await prisma.oauthAccessToken.create({
    data: {
      id: randomUUID(),
      accessToken: `access-${id}`,
      refreshToken: `refresh-${id}`,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      clientId,
      userId: id,
      scopes: "openid",
    },
  });

  return { id, email };
}

function sessionCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .find((value) => value.startsWith("app.session_token="));
  if (!cookie) throw new Error(`no session cookie (status ${response.status})`);
  return cookie;
}

async function signIn(email: string, password = PASSWORD): Promise<Response> {
  return (await handler())(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function sessionUserId(cookie: string): Promise<string | null> {
  const response = await (
    await handler()
  )(
    new Request(`${ORIGIN}/api/auth/get-session`, {
      headers: { cookie, origin: ORIGIN },
    }),
  );
  const body = (await response.json()) as { user?: { id: string } } | null;
  return body?.user?.id ?? null;
}

async function changePassword(cookie: string, body: Record<string, unknown>): Promise<Response> {
  return (await handler())(
    new Request(`${ORIGIN}/api/auth/change-password`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify(body),
    }),
  );
}

async function holdings(userId: string) {
  const prisma = await db();
  const [sessions, apiKeys, tokens] = await Promise.all([
    prisma.authSession.count({ where: { userId } }),
    prisma.apikey.count({ where: { referenceId: userId } }),
    prisma.oauthAccessToken.count({ where: { userId } }),
  ]);
  return { sessions, apiKeys, tokens };
}

describeDatabase("password change against the database", { timeout: 120_000 }, () => {
  afterEach(async () => {
    const prisma = await db();
    while (createdUserIds.length) {
      const id = createdUserIds.pop() as string;
      await prisma.apikey.deleteMany({ where: { referenceId: id } });
      await prisma.authUser.deleteMany({ where: { id } });
    }
    while (createdClientIds.length) {
      const clientId = createdClientIds.pop() as string;
      await prisma.oauthApplication.deleteMany({ where: { clientId } });
    }
  });

  it("signs out browser B when browser A changes the password, even if A does not ask for it", async () => {
    const user = await seedVerifiedUser();
    const browserA = sessionCookie(await signIn(user.email));
    const browserB = sessionCookie(await signIn(user.email));
    expect(await sessionUserId(browserA)).toBe(user.id);
    expect(await sessionUserId(browserB)).toBe(user.id);

    const response = await changePassword(browserA, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: false,
    });

    expect(response.status).toBe(200);
    const browserAAfter = sessionCookie(response);
    expect(await sessionUserId(browserAAfter)).toBe(user.id);
    expect(await sessionUserId(browserA)).toBeNull();
    expect(await sessionUserId(browserB)).toBeNull();
    expect(await holdings(user.id)).toEqual({
      sessions: 1,
      apiKeys: 1,
      tokens: 0,
    });
    expect((await signIn(user.email, PASSWORD)).status).toBe(401);
    expect((await signIn(user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it("keeps every session and token when the current password is wrong", async () => {
    const user = await seedVerifiedUser();
    const browserA = sessionCookie(await signIn(user.email));
    const browserB = sessionCookie(await signIn(user.email));

    const response = await changePassword(browserA, {
      currentPassword: "WrongHorse123!",
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(await sessionUserId(browserA)).toBe(user.id);
    expect(await sessionUserId(browserB)).toBe(user.id);
    expect(await holdings(user.id)).toEqual({
      sessions: 2,
      apiKeys: 1,
      tokens: 1,
    });
  });
});
