import type { Filter } from "@/core/base/base-get.schema";
import type { IngestMessage } from "../../messaging.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MessagingMessageDirection, MessagingMessageOrigin, MessagingProvider } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";

import { emailFolderFilterValue } from "../../inbox/messaging-filter-options.schema";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("a reply sent from the workspace survives filing its thread on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const imapAccountId = randomUUID();
  const gmailAccountId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId });
  const self = "owner@example.invalid";
  const since = new Date(Date.now() - 30 * 86400_000);
  const catalog = [
    { id: "F_INBOX", name: "INBOX", role: "INBOX", totalCount: null, unreadCount: null },
    { id: "F_SENT", name: "Sent Mail", role: "SENT", totalCount: null, unreadCount: null },
    { id: "F_REFERENZ", name: "Referenz", role: null, totalCount: null, unreadCount: null },
  ];

  const attendee = (identifier: string, isSelf = false) => ({
    attendeeId: identifier,
    identifier,
    displayName: null,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf,
    records: [],
  });

  function email(args: {
    provider: MessagingProvider;
    unipileThreadId: string;
    unipileMessageId: string;
    direction: MessagingMessageDirection;
    origin: MessagingMessageOrigin;
    folderIds: string[];
    sentAt: Date;
  }): IngestMessage {
    const outbound = args.direction === MessagingMessageDirection.outbound;
    return {
      unipileMessageId: args.unipileMessageId,
      providerMessageId: `<${args.unipileMessageId}@example.invalid>`,
      unipileThreadId: args.unipileThreadId,
      provider: args.provider,
      direction: args.direction,
      origin: args.origin,
      subject: "Synthetic filing",
      bodyHtml: `<p>${args.unipileMessageId}</p>`,
      bodyText: args.unipileMessageId,
      previewText: null,
      sender: attendee(outbound ? self : "customer@example.invalid", outbound),
      recipients: { to: [attendee(outbound ? "customer@example.invalid" : self, !outbound)], cc: [], bcc: [] },
      attachmentsMeta: [],
      folderIds: args.folderIds,
      reactions: [],
      isEvent: false,
      isDeleted: false,
      isHidden: false,
      sentAt: args.sentAt,
    };
  }

  async function row(connectedAccountId: string, unipileMessageId: string) {
    const { rows } = await client.query<{ folderIds: string[]; isHidden: boolean; origin: string }>(
      'SELECT "folderIds", "isHidden", origin FROM "MessagingMessage" WHERE "connectedAccountId" = $1 AND "unipileMessageId" = $2',
      [connectedAccountId, unipileMessageId],
    );
    return rows[0];
  }

  async function threadId(connectedAccountId: string, unipileThreadId: string) {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM "MessagingThread" WHERE "connectedAccountId" = $1 AND "unipileThreadId" = $2',
      [connectedAccountId, unipileThreadId],
    );
    return rows[0].id;
  }

  const folderFilter = (accountId: string, folderId: string): Filter => ({
    field: FilterFieldKey.emailFolder,
    operator: FilterOperatorKey.in,
    value: [emailFolderFilterValue(accountId, folderId)],
  });

  async function threadsInFolder(accountId: string, folderId: string) {
    const items = await runWithTenant(owner, () =>
      createTestMessagingRepo().getItems({ filters: [folderFilter(accountId, folderId)] }),
    );
    return items.map((item) => item.id);
  }

  async function threadMessageIds(id: string) {
    const { messages } = await runWithTenant(owner, () => createTestMessagingRepo().listMessagesForThread(id));
    return messages.map((message) => message.unipileMessageId);
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" (id,"updatedAt") VALUES ($1,NOW())', [companyId]);
    await client.query(
      'INSERT INTO "UserRole" (id,name,"isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$1,NOW())',
      [companyId],
    );
    await client.query(
      'INSERT INTO "User" (id,email,"firstName","lastName","companyId","roleId",status,"updatedAt") VALUES ($1,$2,\'Sent\',\'Owner\',$3,$3,\'active\',NOW())',
      [ownerId, `sent-owner-${ownerId}@example.invalid`, companyId],
    );
    for (const [id, provider, sentFolderIds, selected] of [
      [imapAccountId, "mail", ["F_SENT"], ["F_INBOX", "F_REFERENZ", "F_SENT"]],
      [gmailAccountId, "google", ["SENT"], ["INBOX", "SENT"]],
    ] as const) {
      await client.query(
        `INSERT INTO "ConnectedAccount" (id,"companyId","userId",provider,"unipileAccountId",status,"emailAddress",
          folders,"selectedFolderIds","sentFolderIds","foldersSyncedAt","updatedAt")
          VALUES ($1,$2,$3,$4,$1,'ok',$5,$6,$7,$8,NOW(),NOW())`,
        [id, companyId, ownerId, provider, self, JSON.stringify(catalog), selected, sentFolderIds],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE id = $1', [companyId]);
    await client.end();
  });

  it("keeps an IMAP reply in its thread and in Sent after a move, a resync and every folder pass", async () => {
    const repo = createTestMessagingRepo();
    const unipileThreadId = `imap-thread-${imapAccountId}`;
    const receivedAt = new Date(Date.now() - 2 * 86400_000);
    const repliedAt = new Date(receivedAt.getTime() + 3600_000);

    await repo.ingestMessageUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      backfill: false,
      message: email({
        provider: MessagingProvider.mail,
        unipileThreadId,
        unipileMessageId: "imap-in",
        direction: MessagingMessageDirection.inbound,
        origin: MessagingMessageOrigin.external,
        folderIds: ["F_INBOX"],
        sentAt: receivedAt,
      }),
    });
    await runWithTenant(owner, () =>
      repo.persistOutboundMessageOrThrow({
        connectedAccountId: imapAccountId,
        message: email({
          provider: MessagingProvider.mail,
          unipileThreadId,
          unipileMessageId: "imap-reply",
          direction: MessagingMessageDirection.outbound,
          origin: MessagingMessageOrigin.unipile,
          folderIds: ["F_SENT"],
          sentAt: repliedAt,
        }),
      }),
    );

    await repo.moveEmailMessageUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      unipileMessageId: "imap-in",
      newUnipileMessageId: "imap-in-referenz",
      folderIds: ["F_REFERENZ"],
    });
    await repo.ingestMessageUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      backfill: true,
      message: email({
        provider: MessagingProvider.mail,
        unipileThreadId,
        unipileMessageId: "imap-in-referenz",
        direction: MessagingMessageDirection.inbound,
        origin: MessagingMessageOrigin.external,
        folderIds: ["F_REFERENZ"],
        sentAt: receivedAt,
      }),
    });
    for (const [folderId, seen] of [
      ["F_INBOX", []],
      ["F_SENT", []],
      ["F_REFERENZ", ["imap-in-referenz"]],
    ] as const) {
      await repo.reconcileFolderMembershipUnscoped({
        companyId,
        connectedAccountId: imapAccountId,
        folderId,
        since,
        seenUnipileMessageIds: [...seen],
      });
    }

    const thread = await threadId(imapAccountId, unipileThreadId);
    expect(await row(imapAccountId, "imap-reply")).toEqual({
      folderIds: ["F_SENT"],
      isHidden: false,
      origin: "unipile",
    });
    expect(await threadMessageIds(thread)).toEqual(["imap-in-referenz", "imap-reply"]);
    expect(await threadsInFolder(imapAccountId, "F_SENT")).toEqual([thread]);
    expect(await threadsInFolder(imapAccountId, "F_REFERENZ")).toEqual([thread]);
  });

  it("never hides a reply of ours that a pass of another folder no longer lists", async () => {
    const repo = createTestMessagingRepo();
    const unipileThreadId = `imap-filed-reply-${imapAccountId}`;
    await runWithTenant(owner, () =>
      repo.persistOutboundMessageOrThrow({
        connectedAccountId: imapAccountId,
        message: email({
          provider: MessagingProvider.mail,
          unipileThreadId,
          unipileMessageId: "imap-filed-reply",
          direction: MessagingMessageDirection.outbound,
          origin: MessagingMessageOrigin.unipile,
          folderIds: ["F_REFERENZ"],
          sentAt: new Date(Date.now() - 86400_000),
        }),
      }),
    );

    await repo.reconcileFolderMembershipUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      folderId: "F_REFERENZ",
      since,
      seenUnipileMessageIds: [],
    });

    expect(await row(imapAccountId, "imap-filed-reply")).toEqual({
      folderIds: [],
      isHidden: false,
      origin: "unipile",
    });
  });

  it("still hides an outbound copy from another mail client that left every listed folder", async () => {
    const repo = createTestMessagingRepo();
    await repo.ingestMessageUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      backfill: true,
      message: email({
        provider: MessagingProvider.mail,
        unipileThreadId: `imap-elsewhere-${imapAccountId}`,
        unipileMessageId: "imap-elsewhere",
        direction: MessagingMessageDirection.outbound,
        origin: MessagingMessageOrigin.external,
        folderIds: ["F_SENT"],
        sentAt: new Date(Date.now() - 86400_000),
      }),
    });

    await repo.reconcileFolderMembershipUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      folderId: "F_SENT",
      since,
      seenUnipileMessageIds: [],
    });

    expect(await row(imapAccountId, "imap-elsewhere")).toEqual({
      folderIds: [],
      isHidden: true,
      origin: "external",
    });
  });

  it("lets the Gmail Sent copy set the placement of a reply sent from the workspace", async () => {
    const repo = createTestMessagingRepo();
    const unipileThreadId = `gmail-thread-${gmailAccountId}`;
    const sentAt = new Date(Date.now() - 86400_000);
    const reply = (origin: MessagingMessageOrigin, folderIds: string[]) =>
      email({
        provider: MessagingProvider.google,
        unipileThreadId,
        unipileMessageId: "gmail-reply",
        direction: MessagingMessageDirection.outbound,
        origin,
        folderIds,
        sentAt,
      });

    await runWithTenant(owner, () =>
      repo.persistOutboundMessageOrThrow({
        connectedAccountId: gmailAccountId,
        message: reply(MessagingMessageOrigin.unipile, ["SENT"]),
      }),
    );
    await repo.ingestMessageUnscoped({
      companyId,
      connectedAccountId: gmailAccountId,
      backfill: false,
      message: reply(MessagingMessageOrigin.external, ["SENT", "IMPORTANT"]),
    });

    expect(await row(gmailAccountId, "gmail-reply")).toEqual({
      folderIds: ["SENT", "IMPORTANT"],
      isHidden: false,
      origin: "unipile",
    });
    expect(await threadsInFolder(gmailAccountId, "SENT")).toEqual([await threadId(gmailAccountId, unipileThreadId)]);
  });

  it("claims a Sent copy that arrived before the send was recorded as sent by the workspace", async () => {
    const repo = createTestMessagingRepo();
    const unipileThreadId = `gmail-early-${gmailAccountId}`;
    const sentAt = new Date(Date.now() - 86400_000);
    const reply = (origin: MessagingMessageOrigin, folderIds: string[]) =>
      email({
        provider: MessagingProvider.google,
        unipileThreadId,
        unipileMessageId: "gmail-early-reply",
        direction: MessagingMessageDirection.outbound,
        origin,
        folderIds,
        sentAt,
      });

    await repo.ingestMessageUnscoped({
      companyId,
      connectedAccountId: gmailAccountId,
      backfill: false,
      message: reply(MessagingMessageOrigin.external, ["SENT"]),
    });
    await runWithTenant(owner, () =>
      repo.persistOutboundMessageOrThrow({
        connectedAccountId: gmailAccountId,
        message: reply(MessagingMessageOrigin.unipile, ["SENT"]),
      }),
    );

    expect(await row(gmailAccountId, "gmail-early-reply")).toEqual({
      folderIds: ["SENT"],
      isHidden: false,
      origin: "unipile",
    });
  });
});
