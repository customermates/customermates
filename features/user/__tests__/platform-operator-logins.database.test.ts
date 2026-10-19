import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { AppPrismaClient } from "@/prisma/db";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getTransactionClient } from "@/core/decorators/transaction-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: { APP_MODE: "cloud", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

const { prisma } = await import("@/prisma/db");
const { strandsLastPlatformOperator } = await import("../platform-operator-logins");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

class Rollback extends Error {}

async function inRolledBackTransaction(fn: (tx: AppPrismaClient) => Promise<void>) {
  try {
    await runWithoutTenant(() =>
      runInTransaction(async () => {
        const tx = getTransactionClient<AppPrismaClient>();
        if (!tx) throw new Error("Expected a transaction client.");
        await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
        await tx.authUser.updateMany({ where: { isPlatformOperator: true }, data: { isPlatformOperator: false } });
        await fn(tx);
        throw new Rollback();
      }),
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

async function login(tx: AppPrismaClient, isPlatformOperator: boolean) {
  const email = `operator-login-${randomUUID()}@example.invalid`;
  await tx.authUser.create({
    data: { id: randomUUID(), email, name: "Login", emailVerified: true, isPlatformOperator },
  });
  return email;
}

async function membership(tx: AppPrismaClient, email: string, status: "active" | "inactive" = "active") {
  const companyId = randomUUID();
  await tx.company.create({ data: { id: companyId } });
  const user = await tx.user.create({
    data: { companyId, email, firstName: "Member", lastName: "Login", status },
  });
  return { companyId, userId: user.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describeDatabase("strandsLastPlatformOperator", { timeout: 120_000 }, () => {
  it("only refuses ending the last active membership of the last operator login", async () => {
    let observed: Record<string, boolean> | null = null;

    await inRolledBackTransaction(async (tx) => {
      const ordinary = await membership(tx, await login(tx, false));
      const noOperators = await strandsLastPlatformOperator(tx, { id: ordinary.userId });

      const operator = await login(tx, true);
      const first = await membership(tx, operator);
      const second = await membership(tx, operator);
      const oneOfTwo = await strandsLastPlatformOperator(tx, { id: first.userId });
      const both = await strandsLastPlatformOperator(tx, { id: { in: [first.userId, second.userId] } });
      const wholeWorkspace = await strandsLastPlatformOperator(tx, { companyId: first.companyId });
      const nonOperator = await strandsLastPlatformOperator(tx, { id: ordinary.userId });

      const peer = await login(tx, true);
      const peerMembership = await membership(tx, peer);
      const bothWithPeer = await strandsLastPlatformOperator(tx, { id: { in: [first.userId, second.userId] } });
      await tx.user.update({ where: { id: peerMembership.userId }, data: { status: "inactive" } });
      const bothWithInactivePeer = await strandsLastPlatformOperator(tx, {
        id: { in: [first.userId, second.userId] },
      });

      observed = { noOperators, oneOfTwo, both, wholeWorkspace, nonOperator, bothWithPeer, bothWithInactivePeer };
    });

    expect(observed).toEqual({
      noOperators: false,
      oneOfTwo: false,
      both: true,
      wholeWorkspace: false,
      nonOperator: false,
      bothWithPeer: false,
      bothWithInactivePeer: true,
    });
  });
});
