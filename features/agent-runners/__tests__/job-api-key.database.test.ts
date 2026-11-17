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
