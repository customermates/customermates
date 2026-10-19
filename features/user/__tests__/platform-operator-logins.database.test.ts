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
const { lockPlatformOperatorInvariant, strandsLastPlatformOperator } = await import("../platform-operator-logins");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

class Rollback extends Error {}

async function inRolledBackTransaction(fn: (tx: AppPrismaClient) => Promise<void>) {
  try {
    await runWithoutTenant(() =>
      runInTransaction(async () => {
        const tx = getTransactionClient<AppPrismaClient>();
        if (!tx) throw new Error("Expected a transaction client.");
        await lockPlatformOperatorInvariant(tx);
        await tx.authUser.updateMany({ where: { isPlatformOperator: true }, data: { isPlatformOperator: false } });
        await fn(tx);
        throw new Rollback();
      }),
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

async function login(tx: AppPrismaClient, isPlatformOperator: boolean, emailVerified = true) {
  const email = `operator-login-${randomUUID()}@example.invalid`;
  await tx.authUser.create({
    data: { id: randomUUID(), email, name: "Login", emailVerified, isPlatformOperator },
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

  it("does not count a membership that cannot act: one in a workspace being deleted or of an unverified login", async () => {
    let observed: Record<string, boolean> | null = null;

    await inRolledBackTransaction(async (tx) => {
      const operator = await login(tx, true);
      const kept = await membership(tx, operator);
      const elsewhere = await membership(tx, operator);
      const beforeDeletion = await strandsLastPlatformOperator(tx, { id: kept.userId });
      await tx.company.update({ where: { id: elsewhere.companyId }, data: { deletingAt: new Date() } });
      const whileDeleting = await strandsLastPlatformOperator(tx, { id: kept.userId });
      await tx.company.update({ where: { id: elsewhere.companyId }, data: { deletingAt: null } });

      const unverified = await login(tx, true, false);
      await membership(tx, unverified);
      await tx.user.update({ where: { id: elsewhere.userId }, data: { status: "inactive" } });
      const withUnverifiedPeer = await strandsLastPlatformOperator(tx, { id: kept.userId });

      observed = { beforeDeletion, whileDeleting, withUnverifiedPeer };
    });

    expect(observed).toEqual({ beforeDeletion: false, whileDeleting: true, withUnverifiedPeer: true });
  });
});
