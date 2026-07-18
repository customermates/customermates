import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectedAccount, messagingMessage, messagingThread } = vi.hoisted(() => ({
  connectedAccount: {
    count: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn(),
  },
  messagingMessage: { findFirstOrThrow: vi.fn() },
  messagingThread: { findFirstOrThrow: vi.fn() },
}));

vi.mock("@/core/di", () => ({ getContactRepo: () => ({}) }));
vi.mock("@/prisma/db", () => ({ prisma: { connectedAccount, messagingMessage, messagingThread } }));

import { runWithTenant } from "@/core/decorators/tenant-context";

import { PrismaConnectedAccountRepo } from "../prisma-connected-account.repository";
import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const user = {
  id: "user-1",
  companyId: "company-1",
  role: { isSystemRole: true, permissions: [] },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  connectedAccount.count.mockResolvedValue(0);
  connectedAccount.findFirstOrThrow.mockResolvedValue({ id: "account-1" });
  connectedAccount.findMany.mockResolvedValue([]);
  messagingThread.findFirstOrThrow.mockResolvedValue({
    id: "thread-1",
    unipileThreadId: "provider-thread-1",
    connectedAccountId: "account-1",
    provider: "google",
    type: "single",
    companyId: "company-1",
    connectedAccount: {
      unipileAccountId: "provider-account-1",
      emailAddress: "max@customermates.com",
      sentFolderIds: [],
      synthetic: true,
    },
  });
  messagingMessage.findFirstOrThrow.mockResolvedValue({
    unipileMessageId: "provider-message-1",
    provider: "google",
    attachmentsMeta: [{ id: "attachment-1" }],
    connectedAccount: { unipileAccountId: "provider-account-1" },
    thread: { unipileThreadId: "provider-thread-1" },
  });
});

describe("PrismaConnectedAccountRepo synthetic account isolation", () => {
  it("does not count display-only accounts against the user's allowance", async () => {
    await runWithTenant(user, () => new PrismaConnectedAccountRepo().countActiveAccountsForUser());

    expect(connectedAccount.count).toHaveBeenCalledWith({
      where: {
        companyId: "company-1",
        userId: "user-1",
        synthetic: false,
        status: { not: "deleted" },
      },
    });
  });

  it("excludes display-only accounts from refresh and outbound provider lookups", async () => {
    await runWithTenant(user, async () => {
      const repo = new PrismaConnectedAccountRepo();
      await repo.listAccountsForRefresh();
      await repo.findUsableAccountByIdOrThrow("account-1");
    });

    expect(connectedAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: "company-1",
          synthetic: false,
          OR: [{ userId: "user-1" }, { shared: true }],
        },
      }),
    );
    expect(connectedAccount.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "account-1",
        companyId: "company-1",
        synthetic: false,
        OR: [{ userId: "user-1" }, { shared: true }],
      },
    });
  });

  it("keeps synthetic accounts available to inbox owner hydration", async () => {
    await runWithTenant(user, () => new PrismaConnectedAccountRepo().listAccountOwnersByIds(["synthetic-1"]));

    expect(connectedAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["synthetic-1"] }, companyId: "company-1" },
      }),
    );
  });
});

describe("PrismaMessagingRepo synthetic account isolation", () => {
  it("marks synthetic threads for a provider-free resync and blocks attachment provider lookups", async () => {
    let thread: Awaited<ReturnType<PrismaMessagingRepo["findThreadForResyncOrThrow"]>> | undefined;

    await runWithTenant(user, async () => {
      const repo = new PrismaMessagingRepo();
      thread = await repo.findThreadForResyncOrThrow("thread-1");
      await repo.findAttachmentForMessageOrThrow({ messageId: "message-1", attachmentId: "attachment-1" });
    });

    expect(thread?.synthetic).toBe(true);
    expect(messagingThread.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "thread-1",
        }),
        select: expect.objectContaining({
          connectedAccount: {
            select: expect.objectContaining({ synthetic: true }),
          },
        }),
      }),
    );
    expect(messagingMessage.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "message-1",
          companyId: "company-1",
          connectedAccount: { is: { synthetic: false } },
        }),
      }),
    );
  });
});
