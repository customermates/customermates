import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const createdUserIds: string[] = [];
const createdClientIds: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function seedUser(options: { emailVerified: boolean }) {
  const prisma = await db();
  const id = randomUUID();
  const email = `link-${id}@example.test`;
  const createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const clientId = `client-${id}`;

  await prisma.authUser.create({
    data: { id, email, name: email, emailVerified: options.emailVerified, createdAt, updatedAt: createdAt },
  });
  createdUserIds.push(id);

  await prisma.authAccount.create({
    data: {
      id: randomUUID(),
      userId: id,
      providerId: "credential",
      accountId: id,
      password: "hashed-password",
      createdAt,
      updatedAt: createdAt,
    },
  });
  await prisma.authAccount.create({
    data: {
      id: randomUUID(),
      userId: id,
      providerId: "microsoft",
      accountId: `entra-${id}`,
      createdAt,
      updatedAt: createdAt,
    },
  });

  const session = await prisma.authSession.create({
    data: {
      id: randomUUID(),
      userId: id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.apikey.create({
    data: { id: randomUUID(), key: `key-${id}`, referenceId: id, createdAt, updatedAt: createdAt },
  });

  await prisma.oauthApplication.create({
    data: { id: randomUUID(), name: "Linking client", clientId, redirectUrls: "", type: "public" },
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
  await prisma.oauthConsent.create({
    data: { id: randomUUID(), clientId, userId: id, scopes: "openid", consentGiven: true },
  });

  return { id, email, sessionId: session.id };
}

async function snapshot(userId: string) {
  const prisma = await db();
  const [accounts, sessions, apiKeys, tokens, consents, user] = await Promise.all([
    prisma.authAccount.findMany({ where: { userId }, orderBy: { providerId: "asc" } }),
    prisma.authSession.findMany({ where: { userId } }),
    prisma.apikey.count({ where: { referenceId: userId } }),
    prisma.oauthAccessToken.count({ where: { userId } }),
    prisma.oauthConsent.count({ where: { userId } }),
    prisma.authUser.findUnique({ where: { id: userId } }),
  ]);

  return {
    providers: accounts.map((account) => account.providerId),
    password: accounts.find((account) => account.providerId === "credential")?.password,
    sessionIds: sessions.map((session) => session.id),
    apiKeys,
    tokens,
    consents,
    emailVerified: user?.emailVerified,
  };
}

async function linkProvider(args: { email: string; providerSaysVerified: boolean }) {
  const { handleOAuthUserInfo } = await import("better-auth/oauth2");
  const { auth } = await import("@/core/auth/better-auth");
  const context = await auth.$context;
  const sub = randomUUID();

  return handleOAuthUserInfo(
    { context } as never,
    {
      userInfo: {
        id: sub,
        email: args.email,
        emailVerified: args.providerSaysVerified,
        name: "Linking User",
        image: null,
      },
      account: { providerId: "google", accountId: sub, accessToken: "token", idToken: "id-token" },
      callbackURL: "/",
    } as never,
  );
}

async function verifyByLink(email: string) {
  const { createEmailVerificationToken } = await import("better-auth/api");
  const { auth } = await import("@/core/auth/better-auth");
  const context = await auth.$context;
  const token = await createEmailVerificationToken(context.secret, email, undefined, 60 * 60);

  return auth.api.verifyEmail({ query: { token } });
}

async function resetPassword(userId: string) {
  const prisma = await db();
  const { auth } = await import("@/core/auth/better-auth");
  const token = randomUUID();
  await prisma.authVerification.create({
    data: {
      id: randomUUID(),
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return auth.api.resetPassword({ body: { newPassword: "ReplacementHorse123!", token } });
}

describe.skipIf(!databaseUrl)("unverified account access against the database", () => {
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

  it("lets a provider-verified address link onto an unverified account and revokes everything it held", async () => {
    const seeded = await seedUser({ emailVerified: false });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: true });

    expect(result.error).toBeNull();
    expect(result.data?.session).toBeTruthy();
    expect(await snapshot(seeded.id)).toEqual({
      providers: ["google"],
      password: undefined,
      sessionIds: [result.data?.session.id],
      apiKeys: 0,
      tokens: 0,
      consents: 0,
      emailVerified: true,
    });
  });

  it("keeps everything an already verified account held when a provider links", async () => {
    const seeded = await seedUser({ emailVerified: true });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: true });

    expect(result.error).toBeNull();
    const after = await snapshot(seeded.id);
    expect(after.providers).toEqual(["credential", "google", "microsoft"]);
    expect(after.password).toBe("hashed-password");
    expect(after.sessionIds).toContain(seeded.sessionId);
    expect(after.sessionIds).toHaveLength(2);
    expect(after).toMatchObject({ apiKeys: 1, tokens: 1, consents: 1 });
  });

  it("keeps refusing a provider that does not vouch even once the address is verified", async () => {
    const seeded = await seedUser({ emailVerified: true });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: false });

    expect(result.error).toBe("account not linked");
    expect((await snapshot(seeded.id)).providers).toEqual(["credential", "microsoft"]);
  });

  it("still refuses a provider that does not vouch for the address", async () => {
    const seeded = await seedUser({ emailVerified: false });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: false });

    expect(result.error).toBe("account not linked");
    expect(result.data).toBeNull();
    expect((await snapshot(seeded.id)).providers).toEqual(["credential", "microsoft"]);
  });

  it("verifies an address by link without signing the visitor in or touching what the account holds", async () => {
    const seeded = await seedUser({ emailVerified: false });

    const result = await verifyByLink(seeded.email);

    expect(result).toEqual({ status: true, user: null });
    expect(await snapshot(seeded.id)).toEqual({
      providers: ["credential", "microsoft"],
      password: "hashed-password",
      sessionIds: [seeded.sessionId],
      apiKeys: 1,
      tokens: 1,
      consents: 1,
      emailVerified: true,
    });
  });

  it("revokes standing access when the password of an unverified account is reset", async () => {
    const seeded = await seedUser({ emailVerified: false });

    await resetPassword(seeded.id);

    const after = await snapshot(seeded.id);
    expect(after.password).not.toBe("hashed-password");
    expect(after).toMatchObject({ sessionIds: [], apiKeys: 0, tokens: 0, consents: 0, emailVerified: false });
  });

  it("leaves a sign-in provider in place when an unverified password is reset, so nobody loses single sign-on", async () => {
    const seeded = await seedUser({ emailVerified: false });

    await resetPassword(seeded.id);

    expect((await snapshot(seeded.id)).providers).toEqual(["credential", "microsoft"]);
  });

  it("leaves a verified account untouched apart from its password when it is reset", async () => {
    const seeded = await seedUser({ emailVerified: true });

    await resetPassword(seeded.id);

    const after = await snapshot(seeded.id);
    expect(after.providers).toEqual(["credential", "microsoft"]);
    expect(after.password).not.toBe("hashed-password");
    expect(after).toMatchObject({
      sessionIds: [seeded.sessionId],
      apiKeys: 1,
      tokens: 1,
      consents: 1,
      emailVerified: true,
    });
  });
});
