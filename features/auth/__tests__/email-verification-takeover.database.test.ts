import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/core/di", async () => {
  const { AuthService } = await import("../auth.service");
  const service = new AuthService({} as never);
  return {
    getAuthService: () => ({
      revokeOauthConsents: (userId: string) => service.revokeOauthConsents(userId),
      sendVerificationEmail: () => Promise.resolve(),
    }),
  };
});
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const ORIGIN = "http://localhost:4000";
const PASSWORD = "SignupHorse123!";
const createdEmails: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function auth() {
  return (await import("@/core/auth/better-auth")).auth;
}

async function http(path: string, init: RequestInit = {}) {
  return (await auth()).handler(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) },
    }),
  );
}

function sessionCookie(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function sessionUser(cookie: string): Promise<string | null> {
  const response = await http("/api/auth/get-session", { method: "GET", headers: { cookie } });
  const body = (await response.json()) as { user?: { id: string } } | null;
  return body?.user?.id ?? null;
}

async function signUp() {
  const prisma = await db();
  const email = `verify-${randomUUID()}@example.test`;
  createdEmails.push(email);
  const response = await http("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, name: email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  const user = await prisma.authUser.findFirst({ where: { email } });
  const userId = user?.id ?? "";
  const createdAt = new Date();
  const otherSession = await prisma.authSession.create({
    data: {
      id: randomUUID(),
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt,
      updatedAt: createdAt,
    },
  });
  await prisma.apikey.create({
    data: { id: randomUUID(), key: `key-${userId}`, referenceId: userId, createdAt, updatedAt: createdAt },
  });
  return { email, userId, cookie: sessionCookie(response), otherSessionId: otherSession.id };
}

async function openVerificationLink(email: string, cookie?: string) {
  const { createEmailVerificationToken } = await import("better-auth/api");
  const context = await (await auth()).$context;
  const token = await createEmailVerificationToken(context.secret, email, undefined, 60 * 60);
  const callbackURL = encodeURIComponent("/auth/verify-email?verified=1");
  return http(`/api/auth/verify-email?token=${token}&callbackURL=${callbackURL}`, {
    method: "GET",
    headers: cookie ? { cookie } : {},
  });
}

async function passwordSignIn(email: string) {
  return http("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
}

describeDatabase("email verification link against the database", { timeout: 120_000 }, () => {
  afterEach(async () => {
    const prisma = await db();
    while (createdEmails.length) {
      const email = createdEmails.pop() as string;
      const users = await prisma.authUser.findMany({ where: { email }, select: { id: true } });
      await prisma.apikey.deleteMany({ where: { referenceId: { in: users.map((user) => user.id) } } });
      await prisma.authUser.deleteMany({ where: { email } });
    }
  });

  it("keeps the password and the verifying browser's session when the link is opened where the account signed up", async () => {
    const prisma = await db();
    const account = await signUp();

    const opened = await openVerificationLink(account.email, account.cookie);

    expect(opened.status).toBe(302);
    expect(await prisma.authUser.findUnique({ where: { id: account.userId } })).toMatchObject({ emailVerified: true });
    expect(await sessionUser(account.cookie)).toBe(account.userId);
    expect(await prisma.authSession.findUnique({ where: { id: account.otherSessionId } })).toBeNull();
    expect(await prisma.authAccount.count({ where: { userId: account.userId, providerId: "credential" } })).toBe(1);
    expect(await prisma.apikey.count({ where: { referenceId: account.userId } })).toBe(0);
    expect((await passwordSignIn(account.email)).status).toBe(200);
  });

  it("removes the password and every session when the link is opened in a browser without the account's session", async () => {
    const prisma = await db();
    const account = await signUp();

    const opened = await openVerificationLink(account.email);

    expect(opened.status).toBe(302);
    expect(opened.headers.get("set-cookie") ?? "").not.toContain("session_token=");
    expect(await prisma.authUser.findUnique({ where: { id: account.userId } })).toMatchObject({ emailVerified: true });
    expect(await sessionUser(account.cookie)).toBeNull();
    expect(await prisma.authSession.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.authAccount.count({ where: { userId: account.userId, providerId: "credential" } })).toBe(0);
    expect(await prisma.apikey.count({ where: { referenceId: account.userId } })).toBe(0);
    expect((await passwordSignIn(account.email)).status).not.toBe(200);
  });

  it("treats another account's session in the verifying browser like no session", async () => {
    const prisma = await db();
    const owner = await signUp();
    const bystander = await signUp();

    await openVerificationLink(owner.email, bystander.cookie);

    expect(await prisma.authAccount.count({ where: { userId: owner.userId, providerId: "credential" } })).toBe(0);
    expect(await sessionUser(owner.cookie)).toBeNull();
    expect(await sessionUser(bystander.cookie)).toBe(bystander.userId);
  });
});
