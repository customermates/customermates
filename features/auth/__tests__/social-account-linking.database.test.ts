import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const createdUserIds: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function seedUser(options: { emailVerified: boolean }) {
  const prisma = await db();
  const id = randomUUID();
  const email = `link-${id}@example.test`;
  const createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000);

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

  await prisma.authSession.create({
    data: {
      id: randomUUID(),
      userId: id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt,
      updatedAt: createdAt,
    },
  });

  return { id, email };
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

describe.skipIf(!databaseUrl)("social account linking against the database", () => {
  afterEach(async () => {
    const prisma = await db();
    while (createdUserIds.length) {
      const id = createdUserIds.pop() as string;
      await prisma.authSession.deleteMany({ where: { userId: id } });
      await prisma.authAccount.deleteMany({ where: { userId: id } });
      await prisma.authUser.deleteMany({ where: { id } });
    }
  });

  it("lets a provider-verified address link onto an unverified account and revokes the stale password", async () => {
    const prisma = await db();
    const seeded = await seedUser({ emailVerified: false });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: true });

    expect(result.error).toBeNull();
    expect(result.data?.session).toBeTruthy();

    const user = await prisma.authUser.findUnique({ where: { id: seeded.id } });
    expect(user?.emailVerified).toBe(true);

    const accounts = await prisma.authAccount.findMany({ where: { userId: seeded.id } });
    expect(accounts.map((account) => account.providerId)).toEqual(["google"]);

    const sessions = await prisma.authSession.findMany({ where: { userId: seeded.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe(result.data?.session.id);
  });

  it("keeps the password of an account that was already verified", async () => {
    const prisma = await db();
    const seeded = await seedUser({ emailVerified: true });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: true });

    expect(result.error).toBeNull();

    const accounts = await prisma.authAccount.findMany({ where: { userId: seeded.id } });
    expect(accounts.map((account) => account.providerId).sort()).toEqual(["credential", "google"]);

    const sessions = await prisma.authSession.findMany({ where: { userId: seeded.id } });
    expect(sessions.length).toBeGreaterThan(1);
  });

  it("keeps refusing a provider that does not vouch even once the address is verified", async () => {
    const prisma = await db();
    const seeded = await seedUser({ emailVerified: true });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: false });

    expect(result.error).toBe("account not linked");

    const accounts = await prisma.authAccount.findMany({ where: { userId: seeded.id } });
    expect(accounts.map((account) => account.providerId)).toEqual(["credential"]);
  });

  it("still refuses a provider that does not vouch for the address", async () => {
    const prisma = await db();
    const seeded = await seedUser({ emailVerified: false });

    const result = await linkProvider({ email: seeded.email, providerSaysVerified: false });

    expect(result.error).toBe("account not linked");
    expect(result.data).toBeNull();

    const accounts = await prisma.authAccount.findMany({ where: { userId: seeded.id } });
    expect(accounts.map((account) => account.providerId)).toEqual(["credential"]);
  });
});
