import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const createdUserIds: string[] = [];

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

async function seedKey(referenceId: string, overrides: { enabled?: boolean; expiresAt?: Date | null } = {}) {
  const prisma = await db();
  const id = randomUUID();
  const now = new Date();
  await prisma.apikey.create({
    data: {
      id,
      key: `hashed-${id}`,
      referenceId,
      enabled: overrides.enabled ?? true,
      expiresAt: overrides.expiresAt === undefined ? new Date(Date.now() + 60 * 60 * 1000) : overrides.expiresAt,
      createdAt: now,
      updatedAt: now,
    },
  });
  return id;
}

async function service() {
  const { AuthService } = await import("@/features/auth/auth.service");
  return new AuthService({ send: vi.fn() } as never);
}

describeDatabase("API key references against the database", { timeout: 120_000 }, () => {
  afterEach(async () => {
    const prisma = await db();
    while (createdUserIds.length) {
      const id = createdUserIds.pop() as string;
      await prisma.apikey.deleteMany({ where: { referenceId: id } });
      await prisma.authUser.deleteMany({ where: { id } });
    }
  });

  it("classifies own active, own unusable, missing and foreign references", async () => {
    const ownerId = await seedAuthUser();
    const otherId = await seedAuthUser();
    const active = await seedKey(ownerId);
    const disabled = await seedKey(ownerId, { enabled: false });
    const expired = await seedKey(ownerId, { expiresAt: new Date(Date.now() - 1000) });
    const unlimited = await seedKey(ownerId, { expiresAt: null });
    const foreign = await seedKey(otherId);
    const missing = randomUUID();

    const result = await (
      await service()
    ).resolveApiKeyReferences(ownerId, [active, disabled, expired, unlimited, foreign, missing]);

    expect([...result.active].sort()).toEqual([active, unlimited].sort());
    expect([...result.foreign]).toEqual([foreign]);
  });

  it("finds references beyond the first hundred keys of the owner", async () => {
    const ownerId = await seedAuthUser();
    const prisma = await db();
    const now = new Date();
    await prisma.apikey.createMany({
      data: Array.from({ length: 120 }, () => {
        const id = randomUUID();
        return { id, key: `hashed-${id}`, referenceId: ownerId, enabled: true, createdAt: now, updatedAt: now };
      }),
    });
    const newest = await seedKey(ownerId);

    const result = await (await service()).resolveApiKeyReferences(ownerId, [newest]);

    expect([...result.active]).toEqual([newest]);
  });

  it("recognizes a key created by the API key plugin as owned by its auth user", async () => {
    const ownerId = await seedAuthUser();
    const { auth } = await import("@/core/auth/better-auth");
    const created = await auth.api.createApiKey({ body: { name: "Cursor", userId: ownerId } });

    const result = await (await service()).resolveApiKeyReferences(ownerId, [created.id]);

    expect([...result.active]).toEqual([created.id]);
  });

  it("treats another owner's existing reference as foreign", async () => {
    const ownerId = await seedAuthUser();
    const otherId = await seedAuthUser();
    const key = await seedKey(ownerId);

    const result = await (await service()).resolveApiKeyReferences(otherId, [key]);

    expect(result.active.size).toBe(0);
    expect([...result.foreign]).toEqual([key]);
  });
});
