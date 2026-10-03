import { createHash, randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const REDIRECT_URI = "https://client.example.test/callback";
const createdUserIds: string[] = [];
const createdClientIds: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

function challengeFor(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function seedUser() {
  const prisma = await db();
  const id = randomUUID();
  await prisma.authUser.create({
    data: { id, email: `consent-${id}@example.test`, name: "Consent User", emailVerified: true },
  });
  createdUserIds.push(id);
  return id;
}

async function seedClient() {
  const prisma = await db();
  const clientId = `client-${randomUUID()}`;
  await prisma.oauthApplication.create({
    data: { id: randomUUID(), name: "Consent client", clientId, redirectUrls: REDIRECT_URI, type: "public" },
  });
  createdClientIds.push(clientId);
  return clientId;
}

async function seedAuthorizationCode(args: {
  userId: string;
  clientId: string;
  verifier: string;
  requireConsent: boolean;
  expiresInMs?: number;
}) {
  const prisma = await db();
  const code = randomUUID();
  await prisma.authVerification.create({
    data: {
      id: randomUUID(),
      identifier: code,
      value: JSON.stringify({
        clientId: args.clientId,
        redirectURI: REDIRECT_URI,
        scope: ["openid", "offline_access"],
        userId: args.userId,
        authTime: Date.now(),
        requireConsent: args.requireConsent,
        state: "state-123",
        codeChallenge: challengeFor(args.verifier),
        codeChallengeMethod: "s256",
      }),
      expiresAt: new Date(Date.now() + (args.expiresInMs ?? 10 * 60 * 1000)),
    },
  });
  return code;
}

async function exchange(args: { code: string; clientId: string; verifier: string }) {
  const { auth } = await import("@/core/auth/better-auth");
  return auth.handler(
    new Request("http://localhost:4000/api/auth/mcp/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: args.code,
        client_id: args.clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: args.verifier,
      }),
    }),
  );
}

async function serviceSignedInAs(userId: string | null) {
  const { AuthService } = await import("@/features/auth/auth.service");
  const service = new AuthService({ send: vi.fn() } as never);
  vi.spyOn(service, "getSession").mockResolvedValue(userId ? ({ user: { id: userId } } as never) : null);
  return service;
}

async function codeExists(code: string) {
  const prisma = await db();
  return (await prisma.authVerification.count({ where: { identifier: code } })) === 1;
}

describeDatabase("MCP authorization codes against the database", { timeout: 120_000 }, () => {
  afterEach(async () => {
    const prisma = await db();
    while (createdUserIds.length) {
      const id = createdUserIds.pop() as string;
      await prisma.oauthAccessToken.deleteMany({ where: { userId: id } });
      await prisma.oauthConsent.deleteMany({ where: { userId: id } });
      await prisma.authVerification.deleteMany({ where: { value: { contains: id } } });
      await prisma.authUser.deleteMany({ where: { id } });
    }
    while (createdClientIds.length) {
      const clientId = createdClientIds.pop() as string;
      await prisma.oauthApplication.deleteMany({ where: { clientId } });
    }
  });

  it("refuses to exchange a code that is still waiting for consent and keeps it pending", async () => {
    const userId = await seedUser();
    const clientId = await seedClient();
    const verifier = randomUUID() + randomUUID();
    const code = await seedAuthorizationCode({ userId, clientId, verifier, requireConsent: true });

    const response = await exchange({ code, clientId, verifier });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    expect(await codeExists(code)).toBe(true);
  });

  it("refuses a code that never passed the consent decision", async () => {
    const userId = await seedUser();
    const clientId = await seedClient();
    const verifier = randomUUID() + randomUUID();
    const code = await seedAuthorizationCode({ userId, clientId, verifier, requireConsent: false });

    const response = await exchange({ code, clientId, verifier });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("exchanges an approved code once with the matching S256 verifier", async () => {
    const userId = await seedUser();
    const clientId = await seedClient();
    const verifier = randomUUID() + randomUUID();
    const consentCode = await seedAuthorizationCode({ userId, clientId, verifier, requireConsent: true });
    const service = await serviceSignedInAs(userId);

    const decision = await service.decideMcpConsent({ consentCode, accept: true });
    const callback = new URL(decision?.redirectURI ?? "");
    const code = callback.searchParams.get("code") ?? "";

    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
    expect(callback.searchParams.get("state")).toBe("state-123");
    expect(await codeExists(consentCode)).toBe(false);

    const wrongVerifier = await exchange({ code, clientId, verifier: `${verifier}x` });
    expect(wrongVerifier.status).toBe(401);

    const secondConsentCode = await seedAuthorizationCode({ userId, clientId, verifier, requireConsent: true });
    const secondDecision = await service.decideMcpConsent({ consentCode: secondConsentCode, accept: true });
    const secondCode = new URL(secondDecision?.redirectURI ?? "").searchParams.get("code") ?? "";

    const first = await exchange({ code: secondCode, clientId, verifier });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ token_type: "Bearer", access_token: expect.any(String) });

    const reused = await exchange({ code: secondCode, clientId, verifier });
    expect(reused.status).toBe(401);

    const prisma = await db();
    expect(await prisma.oauthConsent.count({ where: { userId, clientId, consentGiven: true } })).toBe(1);
    expect(await prisma.oauthAccessToken.count({ where: { userId, clientId } })).toBe(1);
  });

  it("does not let another user see or decide a pending consent", async () => {
    const ownerId = await seedUser();
    const otherId = await seedUser();
    const clientId = await seedClient();
    const consentCode = await seedAuthorizationCode({
      userId: ownerId,
      clientId,
      verifier: randomUUID(),
      requireConsent: true,
    });
    const other = await serviceSignedInAs(otherId);
    const signedOut = await serviceSignedInAs(null);

    expect(await other.getMcpConsentPrompt({ consentCode, clientId })).toBeNull();
    expect(await other.decideMcpConsent({ consentCode, accept: true })).toBeNull();
    expect(await signedOut.decideMcpConsent({ consentCode, accept: true })).toBeNull();
    expect(await codeExists(consentCode)).toBe(true);

    const owner = await serviceSignedInAs(ownerId);
    expect(await owner.getMcpConsentPrompt({ consentCode, clientId: "another-client" })).toBeNull();
    expect(await owner.getMcpConsentPrompt({ consentCode, clientId })).toMatchObject({ clientName: "Consent client" });
  });

  it("removes an expired consent instead of deciding it", async () => {
    const userId = await seedUser();
    const clientId = await seedClient();
    const consentCode = await seedAuthorizationCode({
      userId,
      clientId,
      verifier: randomUUID(),
      requireConsent: true,
      expiresInMs: -1000,
    });
    const service = await serviceSignedInAs(userId);

    expect(await service.decideMcpConsent({ consentCode, accept: true })).toBeNull();
    expect(await codeExists(consentCode)).toBe(false);
  });

  it("returns access_denied with the original state and forgets the code on denial", async () => {
    const userId = await seedUser();
    const clientId = await seedClient();
    const consentCode = await seedAuthorizationCode({
      userId,
      clientId,
      verifier: randomUUID(),
      requireConsent: true,
    });
    const service = await serviceSignedInAs(userId);

    const decision = await service.decideMcpConsent({ consentCode, accept: false });
    const callback = new URL(decision?.redirectURI ?? "");

    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBe("state-123");
    expect(callback.searchParams.has("code")).toBe(false);
    expect(await codeExists(consentCode)).toBe(false);
  });

  it("does not expose the library consent endpoint that skips account-state checks", async () => {
    const { auth } = await import("@/core/auth/better-auth");

    const response = await auth.handler(
      new Request("http://localhost:4000/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept: true, consent_code: randomUUID() }),
      }),
    );

    expect(response.status).toBe(404);
  });
});
