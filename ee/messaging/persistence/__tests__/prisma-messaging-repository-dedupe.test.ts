import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/core/di", () => ({ getContactRepo: () => ({}) }));

const { fakeDb } = vi.hoisted(() => {
  const messages: any[] = [];
  const threads: any[] = [];
  let counter = 0;

  const messagingMessage = {
    findUnique: ({ where }: any) => {
      const key = where.connectedAccountId_unipileMessageId;
      return Promise.resolve(
        messages.find(
          (m) => m.connectedAccountId === key.connectedAccountId && m.unipileMessageId === key.unipileMessageId,
        ) ?? null,
      );
    },
    findFirst: ({ where }: any) => {
      if ("providerMessageId" in where) {
        return Promise.resolve(
          messages.find(
            (m) => m.connectedAccountId === where.connectedAccountId && m.providerMessageId === where.providerMessageId,
          ) ?? null,
        );
      }
      return Promise.resolve(null);
    },
    update: ({ where, data }: any) => {
      const row = messages.find((m) => m.id === where.id);
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    },
    upsert: ({ where, create, update }: any) => {
      const key = where.connectedAccountId_unipileMessageId;
      const existing = messages.find(
        (m) => m.connectedAccountId === key.connectedAccountId && m.unipileMessageId === key.unipileMessageId,
      );
      if (existing) {
        Object.assign(existing, update);
        return Promise.resolve({ ...existing });
      }
      const row = { id: `msg-${++counter}`, ...create };
      messages.push(row);
      return Promise.resolve({ ...row });
    },
  };

  const messagingThread = {
    findFirst: ({ where }: any) => {
      if ("unipileThreadAltId" in where) {
        return Promise.resolve(
          threads.find(
            (t) =>
              t.connectedAccountId === where.connectedAccountId && t.unipileThreadAltId === where.unipileThreadAltId,
          ) ?? null,
        );
      }
      if ("unipileThreadId" in where) {
        return Promise.resolve(
          threads.find(
            (t) => t.connectedAccountId === where.connectedAccountId && t.unipileThreadId === where.unipileThreadId,
          ) ?? null,
        );
      }
      return Promise.resolve(null);
    },
    upsert: ({ where, create, update }: any) => {
      const key = where.connectedAccountId_unipileThreadId;
      const existing = threads.find(
        (t) => t.connectedAccountId === key.connectedAccountId && t.unipileThreadId === key.unipileThreadId,
      );
      if (existing) {
        Object.assign(existing, update);
        return Promise.resolve({ id: existing.id });
      }
      const row = {
        id: `thread-${++counter}`,
        connectedAccountId: key.connectedAccountId,
        unipileThreadId: key.unipileThreadId,
        ...create,
      };
      threads.push(row);
      return Promise.resolve({ id: row.id });
    },
    update: ({ where, data }: any) => {
      const row = threads.find((t) => t.id === where.id);
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    },
    updateMany: () => Promise.resolve({ count: 0 }),
    delete: () => Promise.resolve({}),
  };

  const messagingThreadParticipant = { findMany: () => Promise.resolve([]) };

  return {
    fakeDb: {
      messages,
      threads,
      reset() {
        messages.length = 0;
        threads.length = 0;
        counter = 0;
      },
      prisma: { messagingMessage, messagingThread, messagingThreadParticipant },
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma: fakeDb.prisma }));

import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const CONNECTED_ACCOUNT_ID = "acc-1";
const COMPANY_ID = "company-1";

function outboundEmail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    unipileMessageId: "new-unipile-msg-id",
    providerMessageId: "rfc-msg-1",
    provider: "google",
    direction: "outbound",
    origin: "unipile",
    sender: { attendeeId: "", displayName: null, identifier: "me@company.com" },
    recipients: { to: [], cc: [], bcc: [] },
    subject: "Hello",
    bodyText: "hi there",
    bodyHtml: null,
    attachmentsMeta: [],
    isEvent: false,
    isDeleted: false,
    isHidden: false,
    sentAt: new Date("2026-03-01T00:00:00.000Z"),
    reactions: [],
    unipileThreadId: "unipile-thread-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.reset();
});

describe("PrismaMessagingRepo message dedupe on providerMessageId", () => {
  it("does not insert a duplicate when a message with the same providerMessageId already exists", async () => {
    fakeDb.messages.push({
      id: "msg-existing",
      companyId: COMPANY_ID,
      messagingThreadId: "thread-existing",
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      unipileMessageId: "old-unipile-msg-id",
      providerMessageId: "rfc-msg-1",
      provider: "google",
      direction: "outbound",
      origin: "unipile",
      folderIds: [],
      sender: { attendeeId: "", displayName: null, identifier: "me@company.com" },
    });

    const repo = new PrismaMessagingRepo();

    const result = await repo.ingestMessageUnscoped({
      companyId: COMPANY_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      message: outboundEmail() as never,
      backfill: false,
    });

    expect(fakeDb.messages).toHaveLength(1);
    expect(fakeDb.messages[0].id).toBe("msg-existing");
    expect(result).toMatchObject({ isEcho: false, isDuplicate: true });
  });

  it("inserts a new row when no message with that providerMessageId exists yet", async () => {
    const repo = new PrismaMessagingRepo();

    await repo.ingestMessageUnscoped({
      companyId: COMPANY_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      message: outboundEmail({ providerMessageId: "rfc-msg-brand-new" }) as never,
      backfill: false,
    });

    expect(fakeDb.messages).toHaveLength(1);
    expect(fakeDb.messages[0].unipileMessageId).toBe("new-unipile-msg-id");
    expect(fakeDb.messages[0].providerMessageId).toBe("rfc-msg-brand-new");
  });
});

describe("PrismaMessagingRepo thread dedupe on unipileThreadAltId", () => {
  it("rebinds the existing 1:1 thread's unipileThreadId instead of creating a duplicate thread", async () => {
    fakeDb.threads.push({
      id: "thread-existing",
      companyId: COMPANY_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      unipileThreadId: "old-unipile-thread-id",
      unipileThreadAltId: "+491511234567",
      provider: "whatsapp",
      type: "single",
      name: null,
      subject: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastMessageIsSender: null,
    });

    const repo = new PrismaMessagingRepo();

    const result = await repo.upsertChatThreadUnscoped({
      companyId: COMPANY_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      unipileThreadId: "new-unipile-thread-id",
      unipileThreadAltId: "+491511234567",
      provider: "whatsapp" as never,
      subject: null,
      participants: [],
    } as never);

    expect(fakeDb.threads).toHaveLength(1);
    expect(result.id).toBe("thread-existing");
    expect(fakeDb.threads[0].unipileThreadId).toBe("new-unipile-thread-id");
  });

  it("creates a new thread for a group chat (no stable alt id) even if the chat id changed", async () => {
    fakeDb.threads.push({
      id: "thread-existing",
      companyId: COMPANY_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      unipileThreadId: "old-unipile-thread-id",
      unipileThreadAltId: null,
      provider: "whatsapp",
      type: "group",
      name: "Team chat",
      subject: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastMessageIsSender: null,
    });

    const repo = new PrismaMessagingRepo();

    const result = await repo.upsertChatThreadUnscoped({
      companyId: COMPANY_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      unipileThreadId: "new-unipile-thread-id",
      unipileThreadAltId: null,
      provider: "whatsapp" as never,
      subject: null,
      name: "Team chat",
      participants: [],
    } as never);

    expect(fakeDb.threads).toHaveLength(2);
    expect(result.id).not.toBe("thread-existing");
  });
});
