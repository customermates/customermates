import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const authUserIds: string[] = [];
const companyIds: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
  return { prisma, runWithoutTenant };
}

async function seed() {
  const { prisma, runWithoutTenant } = await db();
  const id = randomUUID();
  const company = await runWithoutTenant(() => prisma.company.create({ data: {} }));
  await prisma.authUser.create({ data: { id, email: `owner-${id}@example.test`, name: "Owner", emailVerified: true } });
  authUserIds.push(id);
  companyIds.push(company.id);
  return { authUserId: id, companyId: company.id };
}

async function sessionUserOf(key: string): Promise<string | null> {
  const { auth } = await import("@/core/auth/better-auth");
  try {
    const session = await auth.api.getSession({ headers: new Headers({ "x-api-key": key }) });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

afterAll(async () => {
  const { prisma, runWithoutTenant } = await db();
  await prisma.apikey.deleteMany({ where: { referenceId: { in: authUserIds } } });
  await prisma.authUser.deleteMany({ where: { id: { in: authUserIds } } });
  await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
});

describeDatabase("the API key of a runner job", { timeout: 60_000 }, () => {
  it("is bound to the workspace, expires with the job and authenticates as the owner", async () => {
    const { issueExpiringApiKey } = await import("@/core/auth/better-auth");
    const { prisma } = await db();
    const { authUserId, companyId } = await seed();
    const expiresAt = new Date(Date.now() + 15 * 60_000);

    const issued = await issueExpiringApiKey({ authUserId, companyId, name: "Runner job one", expiresAt });

    const row = await prisma.apikey.findUnique({ where: { id: issued.id } });
    expect(row).toMatchObject({ referenceId: authUserId, companyId, name: "Runner job one" });
    expect(row?.expiresAt?.getTime()).toBe(expiresAt.getTime());
    expect(await sessionUserOf(issued.key)).toBe(authUserId);
  });

  it("carries the marker of its job attempt and still authenticates as the owner", async () => {
    const { issueExpiringApiKey } = await import("@/core/auth/better-auth");
    const { agentJobCredentialMetadata, parseAgentJobCredentialMetadata } = await import(
      "../agent-job-credential-marker"
    );
    const { prisma } = await db();
    const { authUserId, companyId } = await seed();
    const marker = { jobId: randomUUID(), attempt: 2, runnerId: randomUUID() };

    const issued = await issueExpiringApiKey({
      authUserId,
      companyId,
      name: "Runner job marked",
      expiresAt: new Date(Date.now() + 15 * 60_000),
      metadata: agentJobCredentialMetadata(marker),
    });

    const row = await prisma.apikey.findUnique({ where: { id: issued.id } });
    expect(parseAgentJobCredentialMetadata(row?.metadata)).toEqual(marker);
    expect(await sessionUserOf(issued.key)).toBe(authUserId);
    expect(await sessionUserOf(issued.key)).toBe(authUserId);
    const plain = await issueExpiringApiKey({
      authUserId,
      companyId,
      name: "Ordinary key",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    const plainRow = await prisma.apikey.findUnique({ where: { id: plain.id } });
    expect(parseAgentJobCredentialMetadata(plainRow?.metadata)).toBeNull();
  });

  it("is refused on every HTTP endpoint of the auth library and still resolves a session on the server", async () => {
    const { auth, issueExpiringApiKey } = await import("@/core/auth/better-auth");
    const { agentJobCredentialMetadata } = await import("../agent-job-credential-marker");
    const { env } = await import("@/env");
    const { prisma } = await db();
    const { authUserId, companyId } = await seed();
    const issued = await issueExpiringApiKey({
      authUserId,
      companyId,
      name: "Runner job over HTTP",
      expiresAt: new Date(Date.now() + 15 * 60_000),
      metadata: agentJobCredentialMetadata({ jobId: randomUUID(), attempt: 1, runnerId: randomUUID() }),
    });
    const http = (path: string, body?: unknown) =>
      auth.handler(
        new Request(`${env.BASE_URL}/api/auth${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { "x-api-key": issued.key, origin: env.BASE_URL, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );

    const answers = [
      await http("/get-session"),
      await http("/list-sessions"),
      await http("/update-user", { name: "Renamed by a job key" }),
      await http("/sign-out", {}),
      await http("/api-key/list"),
    ];

    for (const answer of answers) {
      expect(answer.status).toBe(403);
      const text = await answer.text();
      expect(text).toContain("API_KEY_NOT_ACCEPTED");
      expect(text).not.toContain(authUserId);
    }
    expect((await prisma.authUser.findUnique({ where: { id: authUserId } }))?.name).toBe("Owner");
    expect(await sessionUserOf(issued.key)).toBe(authUserId);

    const withoutKey = await auth.handler(new Request(`${env.BASE_URL}/api/auth/get-session`));
    expect(withoutKey.status).toBe(200);
    expect(await withoutKey.text()).toBe("null");
  });

  it("counts tool calls up to the limit and no further, also when they arrive at once", async () => {
    const { issueExpiringApiKey, countApiKeyRequest, apiKeyRequestsNamed } = await import("@/core/auth/better-auth");
    const { authUserId, companyId } = await seed();
    const issued = await issueExpiringApiKey({
      authUserId,
      companyId,
      name: "Runner job counted",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });

    const admitted = await Promise.all(Array.from({ length: 8 }, () => countApiKeyRequest(issued.id, 5)));

    expect(admitted.filter(Boolean)).toHaveLength(5);
    expect(await countApiKeyRequest(issued.id, 5)).toBe(false);
    expect(await apiKeyRequestsNamed(companyId, "Runner job counted")).toBe(5);
    expect(await sessionUserOf(issued.key)).toBe(authUserId);
    expect(await apiKeyRequestsNamed(companyId, "Runner job counted")).toBe(5);
    expect(await apiKeyRequestsNamed(companyId, "No such key")).toBe(0);
    expect(await countApiKeyRequest(randomUUID(), 5)).toBe(false);
  });

  it("stops working once its expiry has passed", async () => {
    const { issueExpiringApiKey } = await import("@/core/auth/better-auth");
    const { authUserId, companyId } = await seed();

    const issued = await issueExpiringApiKey({
      authUserId,
      companyId,
      name: "Runner job short",
      expiresAt: new Date(Date.now() + 1_000),
    });
    expect(await sessionUserOf(issued.key)).toBe(authUserId);
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(await sessionUserOf(issued.key)).toBeNull();
  });

  it("is revoked by name inside its own workspace and leaves other keys alone", async () => {
    const { issueExpiringApiKey, revokeApiKeysNamed } = await import("@/core/auth/better-auth");
    const { authUserId, companyId } = await seed();
    const other = await seed();
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const mine = await issueExpiringApiKey({ authUserId, companyId, name: "Runner job two", expiresAt });
    const sibling = await issueExpiringApiKey({ authUserId, companyId, name: "Runner job three", expiresAt });
    const foreign = await issueExpiringApiKey({
      authUserId: other.authUserId,
      companyId: other.companyId,
      name: "Runner job two",
      expiresAt,
    });

    expect(await revokeApiKeysNamed(companyId, "Runner job two")).toBe(1);

    expect(await sessionUserOf(mine.key)).toBeNull();
    expect(await sessionUserOf(sibling.key)).toBe(authUserId);
    expect(await sessionUserOf(foreign.key)).toBe(other.authUserId);
  });
});
