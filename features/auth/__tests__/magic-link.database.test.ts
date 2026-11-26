import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const sent = vi.hoisted(() => ({ links: [] as { to: string; url: string }[] }));

vi.mock("@/core/di", () => ({
  getAuthService: () => ({
    sendMagicLinkEmail: (args: { to: string; url: string }) => {
      sent.links.push(args);
      return Promise.resolve();
    },
  }),
}));
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
const createdEmails: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function handler() {
  const { auth } = await import("@/core/auth/better-auth");
  return auth.handler;
}

async function requestLink(email: string, callbackURL: string) {
  return (await handler())(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, name: email, callbackURL, errorCallbackURL: "/auth/signin" }),
    }),
  );
}

async function openLink(url: string) {
  return (await handler())(new Request(url, { headers: { origin: ORIGIN } }));
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
      await prisma.authUser.deleteMany({ where: { email } });
      await prisma.authVerification.deleteMany({ where: { value: { contains: email } } });
    }
    sent.links = [];
  });

  it("creates a verified account for an unknown email and signs it in once", async () => {
    const prisma = await db();
    const email = newEmail();

    expect((await requestLink(email, "/onboarding")).status).toBe(200);
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

    await requestLink(email, "/");
    const opened = await openLink(latestLinkFor(email));

    expect(opened.status).toBe(302);
    expect(await prisma.authUser.count({ where: { email } })).toBe(1);
    expect(await prisma.authSession.count({ where: { userId: id } })).toBe(1);
  });

  it("counts the links requested for one address in the last hour", async () => {
    const { AuthService } = await import("../auth.service");
    const service = new AuthService({} as never);
    const email = newEmail();
    const since = new Date(Date.now() - 60 * 60 * 1000);

    await requestLink(email, "/");
    await requestLink(email, "/");

    expect(await service.countMagicLinksSince(email, since)).toBe(2);
    expect(await service.countMagicLinksSince(`other-${email}`, since)).toBe(0);
  });
});
