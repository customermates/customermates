import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  EMAIL_CODE_ALLOWED_ATTEMPTS,
  EMAIL_CODE_SENDS_PER_HOUR,
  emailCodeSentIdentifier,
} from "@/features/auth/email-code";

const state = vi.hoisted(() => ({
  codes: [] as { to: string; code: string }[],
  requestHeaders: new Headers(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(state.requestHeaders),
  cookies: () => Promise.resolve({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("@/core/di", async () => {
  const { AuthService } = await import("../auth.service");
  const service = new AuthService({} as never);
  return {
    getAuthService: () => ({
      revokeOauthConsents: (userId: string) => service.revokeOauthConsents(userId),
      sendVerificationCodeEmail: (args: { to: string; code: string }) => {
        state.codes.push(args);
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
const PASSWORD = "SignupHorse123!";
const createdEmails: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function auth() {
  return (await import("@/core/auth/better-auth")).auth;
}

async function service() {
  const { AuthService } = await import("../auth.service");
  return new AuthService({} as never);
}

async function verifyInteractor() {
  const { VerifyEmailCodeInteractor } = await import("../verify-email-code.interactor");
  return new VerifyEmailCodeInteractor(await service());
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

function latestCodeFor(email: string): string {
  const entry = state.codes.filter((sent) => sent.to === email).at(-1);
  if (!entry) throw new Error(`no confirmation code was sent to ${email}`);
  return entry.code;
}

function wrongCodeFor(email: string): string {
  return latestCodeFor(email) === "000000" ? "111111" : "000000";
}

function inBrowser(cookie?: string) {
  state.requestHeaders = new Headers(cookie ? { cookie, origin: ORIGIN } : { origin: ORIGIN });
}

async function enterCode(code: string, cookie?: string) {
  inBrowser(cookie);
  return (await verifyInteractor()).invoke({ code });
}

async function signUp() {
  const prisma = await db();
  const email = `code-${randomUUID()}@example.test`;
  createdEmails.push(email);
  const response = await http("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, name: email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  const user = await prisma.authUser.findFirst({ where: { email } });
  return { email, userId: user?.id ?? "", cookie: sessionCookie(response) };
}

async function emailVerified(userId: string) {
  const prisma = await db();
  return (await prisma.authUser.findUnique({ where: { id: userId } }))?.emailVerified;
}

async function passwordSignIn(email: string) {
  return http("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
}

describeDatabase("email confirmation code against the database", { timeout: 120_000 }, () => {
  afterEach(async () => {
    const prisma = await db();
    while (createdEmails.length) {
      const email = createdEmails.pop() as string;
      const users = await prisma.authUser.findMany({ where: { email }, select: { id: true } });
      await prisma.apikey.deleteMany({ where: { referenceId: { in: users.map((user) => user.id) } } });
      await prisma.authUser.deleteMany({ where: { email } });
      await prisma.authVerification.deleteMany({
        where: { identifier: { in: [`email-verification-otp-${email}`, emailCodeSentIdentifier(email)] } },
      });
    }
    state.codes = [];
    state.requestHeaders = new Headers();
  });

  it("emails a 6-digit code after a password sign-up and stores only its hash", async () => {
    const prisma = await db();
    const account = await signUp();

    const code = latestCodeFor(account.email);
    const stored = await prisma.authVerification.findFirst({
      where: { identifier: `email-verification-otp-${account.email}` },
    });

    expect(code).toMatch(/^\d{6}$/);
    expect(state.codes.filter((sent) => sent.to === account.email)).toHaveLength(1);
    expect(stored?.value).not.toContain(code);
    expect(stored?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 5_000);
    expect(await emailVerified(account.userId)).toBe(false);
  });

  it("confirms the address in the browser that signed up and keeps its password and session", async () => {
    const prisma = await db();
    const account = await signUp();

    await expect(enterCode(latestCodeFor(account.email), account.cookie)).resolves.toEqual({ ok: true });

    expect(await emailVerified(account.userId)).toBe(true);
    expect(await sessionUser(account.cookie)).toBe(account.userId);
    expect(await prisma.authAccount.count({ where: { userId: account.userId, providerId: "credential" } })).toBe(1);
    expect((await passwordSignIn(account.email)).status).toBe(200);
  });

  it("lets nobody else confirm the account: no session, or another account's session, gets nowhere with the code", async () => {
    const prisma = await db();
    const owner = await signUp();
    const bystander = await signUp();
    const ownerCode = latestCodeFor(owner.email);

    await expect(enterCode(ownerCode)).resolves.toEqual({ ok: false, error: "signedOut" });
    await expect(enterCode(ownerCode, bystander.cookie)).resolves.toMatchObject({ ok: false });

    expect(await emailVerified(owner.userId)).toBe(false);
    expect(await emailVerified(bystander.userId)).toBe(false);
    expect(await sessionUser(owner.cookie)).toBe(owner.userId);
    expect(await prisma.authAccount.count({ where: { userId: owner.userId, providerId: "credential" } })).toBe(1);

    await expect(enterCode(ownerCode, owner.cookie)).resolves.toEqual({ ok: true });
    expect(await emailVerified(owner.userId)).toBe(true);
  });

  it(`refuses a wrong code and, after ${EMAIL_CODE_ALLOWED_ATTEMPTS} wrong tries, the right one too`, async () => {
    const account = await signUp();
    const wrong = wrongCodeFor(account.email);

    for (let attempt = 0; attempt < EMAIL_CODE_ALLOWED_ATTEMPTS; attempt++)
      await expect(enterCode(wrong, account.cookie)).resolves.toEqual({ ok: false, error: "invalid" });

    await expect(enterCode(latestCodeFor(account.email), account.cookie)).resolves.toEqual({
      ok: false,
      error: "tooManyAttempts",
    });
    expect(await emailVerified(account.userId)).toBe(false);
  });

  it("refuses an expired code", async () => {
    const prisma = await db();
    const account = await signUp();
    await prisma.authVerification.updateMany({
      where: { identifier: `email-verification-otp-${account.email}` },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(enterCode(latestCodeFor(account.email), account.cookie)).resolves.toEqual({
      ok: false,
      error: "expired",
    });
    expect(await emailVerified(account.userId)).toBe(false);
  });

  it("replaces the earlier code when a new one is sent", async () => {
    const account = await signUp();
    const first = latestCodeFor(account.email);

    await expect((await service()).sendVerificationCode(account.email)).resolves.toBe("sent");
    const second = latestCodeFor(account.email);

    if (first !== second)
      await expect(enterCode(first, account.cookie)).resolves.toEqual({ ok: false, error: "invalid" });
    await expect(enterCode(second, account.cookie)).resolves.toEqual({ ok: true });
  });

  it(`sends at most ${EMAIL_CODE_SENDS_PER_HOUR} new codes per address in an hour, keeping the last code valid`, async () => {
    const account = await signUp();
    const authService = await service();

    for (let send = 0; send < EMAIL_CODE_SENDS_PER_HOUR; send++)
      await expect(authService.sendVerificationCode(account.email)).resolves.toBe("sent");
    const lastSent = latestCodeFor(account.email);

    await expect(authService.sendVerificationCode(account.email)).resolves.toBe("rateLimited");
    expect(state.codes.filter((sent) => sent.to === account.email)).toHaveLength(EMAIL_CODE_SENDS_PER_HOUR + 1);
    await expect(enterCode(lastSent, account.cookie)).resolves.toEqual({ ok: true });
  });

  it("closes every raw code endpoint, so codes are only sent and checked through the session-bound server actions", async () => {
    const account = await signUp();
    const code = latestCodeFor(account.email);
    const headers = { cookie: account.cookie };
    const requests: [string, Record<string, unknown>][] = [
      ["/api/auth/email-otp/verify-email", { email: account.email, otp: code }],
      ["/api/auth/email-otp/check-verification-otp", { email: account.email, otp: code, type: "email-verification" }],
      ["/api/auth/email-otp/send-verification-otp", { email: account.email, type: "email-verification" }],
      ["/api/auth/send-verification-email", { email: account.email }],
      ["/api/auth/sign-in/email-otp", { email: account.email, otp: code }],
      ["/api/auth/forget-password/email-otp", { email: account.email }],
      ["/api/auth/email-otp/reset-password", { email: account.email, otp: code, password: "OtherHorse123!" }],
    ];

    for (const [path, body] of requests) {
      const response = await http(path, { method: "POST", body: JSON.stringify(body), headers });
      expect(response.status, path).toBe(404);
    }
    expect(state.codes.filter((sent) => sent.to === account.email)).toHaveLength(1);
    expect(await emailVerified(account.userId)).toBe(false);
  });

  it("sends an old confirmation link to the code page, keeping its invitation, and changes nothing on the account", async () => {
    const prisma = await db();
    const account = await signUp();
    const { createEmailVerificationToken } = await import("better-auth/api");
    const context = await (await auth()).$context;
    const token = await createEmailVerificationToken(context.secret, account.email, undefined, 60 * 60);
    const callbackURL = encodeURIComponent("/auth/verify-email?verified=1&intent=signed.intent");

    for (const cookie of [undefined, account.cookie]) {
      const opened = await http(`/api/auth/verify-email?token=${token}&callbackURL=${callbackURL}`, {
        method: "GET",
        headers: cookie ? { cookie } : {},
      });

      expect(opened.status).toBe(302);
      expect(opened.headers.get("location")).toBe("/auth/verify-email?link=retired&intent=signed.intent");
    }

    expect(await emailVerified(account.userId)).toBe(false);
    expect(await sessionUser(account.cookie)).toBe(account.userId);
    expect(await prisma.authAccount.count({ where: { userId: account.userId, providerId: "credential" } })).toBe(1);
    await expect((await auth()).api.verifyEmail({ query: { token } })).rejects.toMatchObject({
      body: { code: "VERIFICATION_LINK_RETIRED" },
    });
    expect(await emailVerified(account.userId)).toBe(false);
  });
});
