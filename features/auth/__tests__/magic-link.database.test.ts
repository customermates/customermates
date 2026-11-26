import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { MAGIC_LINK_REQUESTS_PER_HOUR, magicLinkIssuedIdentifier } from "@/features/auth/magic-link-limit";

const sent = vi.hoisted(() => ({ links: [] as { to: string; url: string }[] }));

vi.mock("@/core/di", async () => {
  const { AuthService } = await import("../auth.service");
  const service = new AuthService({} as never);
  return {
    getAuthService: () => ({
      recordMagicLinkIssued: (email: string) => service.recordMagicLinkIssued(email),
      revokeOauthConsents: (userId: string) => service.revokeOauthConsents(userId),
      sendVerificationEmail: () => Promise.resolve(),
      sendMagicLinkEmail: (args: { to: string; url: string }) => {
        sent.links.push(args);
        return Promise.resolve();
      },
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
const ATTACKER_PASSWORD = "AttackerHorse123!";
const createdEmails: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function auth() {
  return (await import("@/core/auth/better-auth")).auth;
}

async function requestLink(email: string, callbackURL = "/") {
  return (await auth()).api.signInMagicLink({
    headers: new Headers({ origin: ORIGIN }),
    body: { email, name: email, callbackURL, errorCallbackURL: "/auth/signin" },
  });
}

async function http(path: string, init: RequestInit = {}) {
  return (await auth()).handler(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) },
    }),
  );
}

async function openLink(url: string) {
  return (await auth()).handler(new Request(url, { headers: { origin: ORIGIN } }));
}

function sessionCookie(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function sessionUser(cookie: string): Promise<string | null> {
  const response = await http("/api/auth/get-session", { method: "GET", headers: { cookie } });
  const body = (await response.json()) as { user?: { id: string } } | null;
  return body?.user?.id ?? null;
}

function latestLinkFor(email: string): string {
  const link = sent.links.filter((entry) => entry.to === email).at(-1);
  if (!link) throw new Error(`no sign-in link was sent to ${email}`);
  return link.url;
}

function newEmail() {
  const email = `magic-${randomUUID()}@example.test`;
  createdEmails.push(email);
  return email;
}

describeDatabase("magic link sign-in against the database", { timeout: 120_000 }, () => {
  afterEach(async () => {
    const prisma = await db();
    while (createdEmails.length) {
      const email = createdEmails.pop() as string;
      const users = await prisma.authUser.findMany({ where: { email }, select: { id: true } });
      await prisma.apikey.deleteMany({ where: { referenceId: { in: users.map((user) => user.id) } } });
      await prisma.authUser.deleteMany({ where: { email } });
      await prisma.authVerification.deleteMany({
        where: { OR: [{ value: { contains: email } }, { identifier: magicLinkIssuedIdentifier(email) }] },
      });
    }
    sent.links = [];
  });

  it("creates a verified account for an unknown email and signs it in once", async () => {
    const prisma = await db();
    const email = newEmail();

    await expect(requestLink(email, "/onboarding")).resolves.toEqual({ status: true });
    const url = latestLinkFor(email);
    expect(new URL(url).pathname).toBe("/api/auth/magic-link/verify");

    const stored = await prisma.authVerification.findMany({ where: { value: { contains: email } } });
    expect(stored).toHaveLength(1);
    const [verification] = stored;
    expect(verification?.identifier).not.toBe(new URL(url).searchParams.get("token"));
    const lifetime = (verification?.expiresAt.getTime() ?? 0) - Date.now();
    expect(lifetime).toBeGreaterThan(14 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(15 * 60 * 1000);

    const opened = await openLink(url);
    expect(opened.status).toBe(302);
    expect(new URL(opened.headers.get("location") ?? "", ORIGIN).pathname).toBe("/onboarding");
    expect(opened.headers.get("set-cookie")).toContain("session_token");

    const user = await prisma.authUser.findFirst({ where: { email } });
    expect(user).toMatchObject({ email, emailVerified: true, companyId: null });
    const userId = user?.id ?? "";
    expect(await prisma.authSession.count({ where: { userId } })).toBe(1);

    const reused = await openLink(url);
    expect(reused.status).toBe(302);
    const retry = new URL(reused.headers.get("location") ?? "", ORIGIN);
    expect(retry.pathname).toBe("/auth/signin");
    expect(retry.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(await prisma.authSession.count({ where: { userId } })).toBe(1);
  });

  it("signs an existing account in without creating another one", async () => {
    const prisma = await db();
    const email = newEmail();
    const id = randomUUID();
    await prisma.authUser.create({ data: { id, email, name: email, emailVerified: true } });

    await requestLink(email);
    const opened = await openLink(latestLinkFor(email));

    expect(opened.status).toBe(302);
    expect(await prisma.authUser.count({ where: { email } })).toBe(1);
    expect(await prisma.authSession.count({ where: { userId: id } })).toBe(1);
  });

  it("refuses the raw request endpoint so every link goes through the protected server action", async () => {
    const email = newEmail();

    const response = await http("/api/auth/sign-in/magic-link", {
      method: "POST",
      body: JSON.stringify({ email, callbackURL: "/" }),
    });

    expect(response.status).toBe(404);
    expect(sent.links).toEqual([]);
  });

  it("stops after five links per address in an hour, even when the earlier links were used", async () => {
    const email = newEmail();

    await requestLink(email);
    await openLink(latestLinkFor(email));
    for (let index = 1; index < MAGIC_LINK_REQUESTS_PER_HOUR; index++) await requestLink(email);
    expect(sent.links).toHaveLength(MAGIC_LINK_REQUESTS_PER_HOUR);

    await expect(requestLink(email)).rejects.toMatchObject({ body: { code: "MAGIC_LINK_RATE_LIMITED" } });
    expect(sent.links).toHaveLength(MAGIC_LINK_REQUESTS_PER_HOUR);

    const other = newEmail();
    await expect(requestLink(other)).resolves.toEqual({ status: true });
  });

  it("takes an account pre-registered with the victim's address away from the attacker when the victim opens a link", async () => {
    const prisma = await db();
    const email = newEmail();

    const signedUp = await http("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, name: email, password: ATTACKER_PASSWORD }),
    });
    expect(signedUp.status).toBe(200);
    const attackerCookie = sessionCookie(signedUp);
    const user = await prisma.authUser.findFirst({ where: { email } });
    const userId = user?.id ?? "";
    expect(user?.emailVerified).toBe(false);
    expect(await sessionUser(attackerCookie)).toBe(userId);
    const createdAt = new Date();
    await prisma.apikey.create({
      data: { id: randomUUID(), key: `key-${userId}`, referenceId: userId, createdAt, updatedAt: createdAt },
    });

    await requestLink(email);
    const opened = await openLink(latestLinkFor(email));
    const victimCookie = sessionCookie(opened);

    expect(opened.status).toBe(302);
    expect(await sessionUser(victimCookie)).toBe(userId);
    expect(await sessionUser(attackerCookie)).toBeNull();
    expect(await prisma.authUser.findUnique({ where: { id: userId } })).toMatchObject({ emailVerified: true });
    expect(await prisma.authAccount.count({ where: { userId, providerId: "credential" } })).toBe(0);
    expect(await prisma.apikey.count({ where: { referenceId: userId } })).toBe(0);
    expect(await prisma.authSession.count({ where: { userId } })).toBe(1);

    const attackerSignIn = await http("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: ATTACKER_PASSWORD }),
    });
    expect(attackerSignIn.status).not.toBe(200);
  });
});
