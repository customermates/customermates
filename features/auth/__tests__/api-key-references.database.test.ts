import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];

async function db() {
  const { prisma } = await import("@/prisma/db");
  return prisma;
}

async function seedAuthUser() {
  const prisma = await db();
  const id = randomUUID();
  await prisma.authUser.create({
    data: { id, email: `keys-${id}@example.test`, name: "Key Owner", emailVerified: true },
  });
  createdUserIds.push(id);
  return id;
}

async function seedCompany() {
  const prisma = await db();
  const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
  const company = await runWithoutTenant(() => prisma.company.create({ data: {} }));
  createdCompanyIds.push(company.id);
  return company.id;
}

let workspaceId = "";

describeDatabase("API key workspace binding against the database", { timeout: 120_000 }, () => {
  beforeEach(async () => {
    workspaceId = await seedCompany();
  });

  afterEach(async () => {
    const prisma = await db();
    while (createdUserIds.length) {
      const id = createdUserIds.pop() as string;
      await prisma.apikey.deleteMany({ where: { referenceId: id } });
      await prisma.authUser.deleteMany({ where: { id } });
    }
    const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
    while (createdCompanyIds.length) {
      const id = createdCompanyIds.pop() as string;
      await runWithoutTenant(() => prisma.company.deleteMany({ where: { id } }));
    }
  });

  it("binds a key to one workspace only once", async () => {
    const ownerId = await seedAuthUser();
    const otherWorkspaceId = await seedCompany();
    const { auth, bindApiKeyToCompany } = await import("@/core/auth/better-auth");
    const created = await auth.api.createApiKey({ body: { name: "Agent", userId: ownerId } });

    expect(await bindApiKeyToCompany(created.id, ownerId, workspaceId)).toBe(true);
    expect(await bindApiKeyToCompany(created.id, ownerId, otherWorkspaceId)).toBe(false);
    expect(await bindApiKeyToCompany(created.id, randomUUID(), otherWorkspaceId)).toBe(false);
  });
});
