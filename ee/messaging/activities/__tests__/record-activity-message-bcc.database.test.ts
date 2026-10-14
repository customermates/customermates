import { PermissionService } from "@/core/base/permission.service";
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
const { PrismaRecordActivitiesRepo } = await import("@/ee/messaging/activities/prisma-record-activities.repository");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const bcc = [{ identifier: "hidden-bcc@example.test", displayName: "Hidden" }];
let companyId: string;
let owner: TenantUser;
let viewer: TenantUser;
let privateMessageId: string;
let sharedMessageId: string;

function fixtureClient() {
  return getTransactionClient<AppPrismaClient>() ?? prisma;
}

async function createOutboundMessage(accountShared: boolean) {
  return runWithTenant(owner, async () => {
    const account = await fixtureClient().connectedAccount.create({
      data: {
        companyId,
        userId: owner.id,
        provider: "mail",
        status: "ok",
        unipileAccountId: randomUUID(),
        shared: accountShared,
        foldersSyncedAt: new Date(),
        selectedFolderIds: ["INBOX"],
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
    const message = await fixtureClient().messagingMessage.create({
      data: {
        companyId,
        connectedAccountId: account.id,
        messagingThreadId: thread.id,
        provider: "mail",
        unipileMessageId: randomUUID(),
        direction: "outbound",
        origin: "unipile",
        sender: { identifier: "owner@example.test" },
        recipients: { to: [{ identifier: "customer@example.test" }], cc: [], bcc },
        folderIds: ["INBOX", "PRIVATE-FOLDER"],
        sentAt: new Date("2026-01-01T12:00:00Z"),
      },
    });
    return message.id;
  });
}

async function readMessage(user: TenantUser, id: string) {
  const [row] = await runWithTenant(user, () =>
    new PrismaRecordActivitiesRepo(new PermissionService()).messagesCompanyWide([id]),
  );
  return row.message as unknown as { recipients: { bcc: unknown[] }; folderIds: string[] };
}

describeDatabase("record activity messages from another user's account", () => {
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
    privateMessageId = await createOutboundMessage(false);
    sharedMessageId = await createOutboundMessage(true);
  });

  afterAll(async () => {
    if (companyId) await runWithoutTenant(() => fixtureClient().company.delete({ where: { id: companyId } }));
  });

  it("hides the BCC list and unselected folders of a CRM-shared thread on a private account", async () => {
    const message = await readMessage(viewer, privateMessageId);
    expect(message.recipients.bcc).toEqual([]);
    expect(message.folderIds).toEqual(["INBOX"]);
  });

  it("keeps the BCC list for the account owner and for a shared account", async () => {
    const own = await readMessage(owner, privateMessageId);
    expect(own.recipients.bcc).toEqual(bcc);
    expect(own.folderIds).toEqual(["INBOX", "PRIVATE-FOLDER"]);
    const shared = await readMessage(viewer, sharedMessageId);
    expect(shared.recipients.bcc).toEqual(bcc);
  });
});
