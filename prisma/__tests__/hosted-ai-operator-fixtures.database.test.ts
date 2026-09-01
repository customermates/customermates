import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { SYNTHETIC_SEED_USER, SYNTHETIC_SHARED_USER_PASSWORD } from "@/core/config/synthetic-seed-user";
import { PrismaClient } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { createSeedContext } from "../seeds/context";
import {
  seedLocalHostedAiOperatorAccess,
  seedHostedAiOperatorUserTableFixtures,
  SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS,
} from "../seeds/hosted-ai-operator";
import { seedIdentity } from "../seeds/identity";

const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client) {
  for (const name of migrationNames())
    await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (isolatedUrl: string) => Promise<T>) {
  const databaseName = `cus126_fixtures_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: databaseUrl });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    database = new Client({ connectionString: isolatedUrl.toString() });
    await database.connect();
    await applyMigrations(database);
    return await fn(isolatedUrl.toString());
  } finally {
    await database?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("hosted AI operator user-table fixtures", { timeout: 120_000 }, () => {
  it("revokes every local operator grant when the seed returns to its remote-safe default", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (isolatedUrl) => {
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl }) });
      const context = createSeedContext(prisma, {
        seedUserEmail: SYNTHETIC_SEED_USER.email,
        sharedUserPassword: SYNTHETIC_SHARED_USER_PASSWORD,
      });
      const tableIds = SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ id }) => id);

      try {
        await seedIdentity(context);
        await seedLocalHostedAiOperatorAccess(context);
        await seedHostedAiOperatorUserTableFixtures(context, { includeLocalOperatorAccess: true });
        await expect(prisma.user.findUniqueOrThrow({ where: { id: context.ids.user } })).resolves.toMatchObject({
          isPlatformOperator: true,
        });
        await expect(prisma.user.count({ where: { id: { in: tableIds }, isPlatformOperator: true } })).resolves.toBe(4);

        await seedIdentity(context);
        await seedHostedAiOperatorUserTableFixtures(context);
        await seedIdentity(context);
        await seedHostedAiOperatorUserTableFixtures(context);

        await expect(prisma.user.findUniqueOrThrow({ where: { id: context.ids.user } })).resolves.toMatchObject({
          isPlatformOperator: false,
        });
        await expect(prisma.user.count({ where: { id: { in: tableIds }, isPlatformOperator: true } })).resolves.toBe(0);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

  it("converges twice and supports every filter plus a second stable page", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (isolatedUrl) => {
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl }) });
      const context = createSeedContext(prisma, {
        seedUserEmail: "hosted-ai.seed@example.invalid",
        sharedUserPassword: SYNTHETIC_SHARED_USER_PASSWORD,
      });
      const ids = SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ id }) => id);
      const noSubscription = SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.find(({ subscription }) => !subscription);
      const providerManaged = SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.find(
        ({ subscription }) => subscription?.lemonSqueezyId,
      );
      if (!noSubscription || !providerManaged?.subscription)
        throw new Error("Operator fixtures must include missing and provider-managed subscriptions");

      try {
        await seedHostedAiOperatorUserTableFixtures(context);
        await expect(prisma.user.count({ where: { id: { in: ids }, isPlatformOperator: true } })).resolves.toBe(0);
        await seedHostedAiOperatorUserTableFixtures(context, { includeLocalOperatorAccess: true });

        await prisma.user.update({
          where: { id: providerManaged.id },
          data: { isPlatformOperator: !providerManaged.isPlatformOperator, status: "inactive" },
        });
        await prisma.authUser.update({
          where: { id: providerManaged.id },
          data: { emailVerified: !providerManaged.authEmailVerified },
        });
        await prisma.subscription.update({
          where: { companyId: providerManaged.companyId },
          data: { lemonSqueezyId: "synthetic-edited-provider-subscription", status: "expired" },
        });
        await prisma.subscription.create({
          data: {
            id: randomUUID(),
            companyId: noSubscription.companyId,
            plan: "starter",
            quantity: 1,
            status: "active",
          },
        });

        await seedHostedAiOperatorUserTableFixtures(context, { includeLocalOperatorAccess: true });

        await expect(prisma.user.count({ where: { id: { in: ids } } })).resolves.toBe(32);
        await expect(prisma.authUser.count({ where: { id: { in: ids } } })).resolves.toBe(32);
        await expect(
          prisma.subscription.count({
            where: {
              companyId: { in: SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map(({ companyId }) => companyId) },
            },
          }),
        ).resolves.toBe(28);

        const rows = await prisma.user.findMany({
          where: { id: { in: ids } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: { company: { select: { subscription: true } } },
        });
        const authUsers = await prisma.authUser.findMany({ where: { id: { in: ids } } });

        expect(new Set(rows.map(({ status }) => status))).toEqual(
          new Set(["active", "inactive", "pendingAuthorization"]),
        );
        expect(new Set(rows.map(({ company }) => company.subscription?.plan ?? null))).toEqual(
          new Set(["starter", "pro", "business", "enterprise", null]),
        );
        expect(new Set(rows.map(({ company }) => company.subscription?.status ?? null))).toEqual(
          new Set(["trial", "active", "cancelled", "expired", "pastDue", "unPaid", null]),
        );
        expect(rows.filter(({ isPlatformOperator }) => isPlatformOperator)).toHaveLength(4);
        expect(authUsers.some(({ emailVerified }) => !emailVerified)).toBe(true);
        expect(rows.every(({ email }) => email.endsWith("@example.invalid"))).toBe(true);
        expect(rows.find(({ id }) => id === noSubscription.id)?.company.subscription).toBeNull();
        expect(rows.find(({ id }) => id === providerManaged.id)).toMatchObject({
          isPlatformOperator: providerManaged.isPlatformOperator,
          status: providerManaged.status,
          company: {
            subscription: {
              lemonSqueezyId: providerManaged.subscription.lemonSqueezyId,
              lemonSqueezyVariantId: providerManaged.subscription.lemonSqueezyVariantId,
            },
          },
        });
        expect(authUsers.find(({ id }) => id === providerManaged.id)?.emailVerified).toBe(
          providerManaged.authEmailVerified,
        );

        const search = await prisma.user.findMany({
          where: {
            id: { in: ids },
            OR: [
              { email: { contains: "OPERATOR-USER-31", mode: "insensitive" } },
              { firstName: { contains: "OPERATOR-USER-31", mode: "insensitive" } },
              { lastName: { contains: "OPERATOR-USER-31", mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        expect(search).toEqual([{ id: SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS[30]?.id }]);

        for (const status of ["active", "inactive", "pendingAuthorization"] as const)
          await expect(prisma.user.count({ where: { id: { in: ids }, status } })).resolves.toBeGreaterThan(0);
        for (const plan of ["starter", "pro", "business", "enterprise"] as const) {
          await expect(
            prisma.user.count({ where: { id: { in: ids }, company: { subscription: { plan } } } }),
          ).resolves.toBeGreaterThan(0);
        }
        for (const status of ["trial", "active", "cancelled", "expired", "pastDue", "unPaid"] as const) {
          await expect(
            prisma.user.count({ where: { id: { in: ids }, company: { subscription: { status } } } }),
          ).resolves.toBeGreaterThan(0);
        }
        await expect(
          prisma.user.count({ where: { id: { in: ids }, company: { subscription: { is: null } } } }),
        ).resolves.toBe(4);
        await expect(prisma.user.count({ where: { id: { in: ids }, isPlatformOperator: true } })).resolves.toBe(4);
        await expect(prisma.user.count({ where: { id: { in: ids }, isPlatformOperator: false } })).resolves.toBe(28);

        const firstPage = await prisma.user.findMany({
          where: { id: { in: ids } },
          take: 25,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        const cursor = firstPage.at(-1)?.id;
        if (!cursor) throw new Error("The first fixture page must have a cursor");
        const secondPage = await prisma.user.findMany({
          where: { id: { in: ids } },
          cursor: { id: cursor },
          skip: 1,
          take: 25,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });

        expect(firstPage).toHaveLength(25);
        expect(secondPage).toHaveLength(7);
        expect(new Set([...firstPage, ...secondPage].map(({ id }) => id)).size).toBe(32);
        expect([...firstPage, ...secondPage].map(({ id }) => id)).toEqual(rows.map(({ id }) => id));
      } finally {
        await prisma.$disconnect();
      }
    });
  });
});
