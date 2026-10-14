import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppPrismaClient } from "@/prisma/db";
import type { TenantUser } from "@/features/user/user.schema";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { getTransactionClient } = await import("@/core/decorators/transaction-context");
const { getRecordAccessPolicy, getRecordRepo } = await import("@/core/di");
const { PrismaMessagingRepo } = await import("../prisma-messaging.repository");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
let companyId: string;
let owner: TenantUser;
let viewer: TenantUser;
let privateThreadId: string;
let sharedThreadId: string;

function fixtureClient() {
  return getTransactionClient<AppPrismaClient>() ?? prisma;
}

async function createCrmSharedThread(accountShared: boolean) {
  return runWithTenant(owner, async () => {
    const account = await fixtureClient().connectedAccount.create({
      data: {
        companyId,
        userId: owner.id,
        provider: "mail",
        status: "ok",
        unipileAccountId: randomUUID(),
        shared: accountShared,
      },
    });
    const thread = await fixtureClient().messagingThread.create({
      data: {
        companyId,
        connectedAccountId: account.id,
        provider: "mail",
        unipileThreadId: randomUUID(),
        sharedToCrm: true,
      },
    });
    return thread.id;
  });
}

function findForResync(user: TenantUser, threadId: string) {
  return runWithTenant(user, () =>
    new PrismaMessagingRepo(getRecordRepo(), getRecordAccessPolicy()).findThreadForResync(threadId),
  );
}

describeDatabase("thread resync on another user's account", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Owned local database required");
    const seed = await runWithoutTenant(async () => {
      const company = await fixtureClient().company.create({ data: {} });
      const role = await fixtureClient().userRole.create({ data: { companyId: company.id, name: "Member" } });
      const user = (firstName: string) =>
        fixtureClient().user.create({
          data: {
            companyId: company.id,
            roleId: role.id,
            firstName,
            lastName: "Test",
            email: `${randomUUID()}@example.test`,
            status: "active",
          },
        });
      return { company, role, ownerUser: await user("Owner"), viewerUser: await user("Viewer") };
    });
    companyId = seed.company.id;
    owner = createMockUser({ ...seed.ownerUser, role: { ...seed.role, permissions: [] } });
    viewer = createMockUser({ ...seed.viewerUser, role: { ...seed.role, permissions: [] } });
    privateThreadId = await createCrmSharedThread(false);
    sharedThreadId = await createCrmSharedThread(true);
  });

  afterAll(async () => {
    if (companyId) await runWithoutTenant(() => fixtureClient().company.delete({ where: { id: companyId } }));
  });

  it("refuses a CRM-shared thread on another user's private account", async () => {
    expect(await findForResync(viewer, privateThreadId)).toBeNull();
  });

  it("allows the account owner and any member of a shared account", async () => {
    expect(await findForResync(owner, privateThreadId)).toMatchObject({ id: privateThreadId });
    expect(await findForResync(viewer, sharedThreadId)).toMatchObject({ id: sharedThreadId });
  });
});
