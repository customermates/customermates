import type { Filter } from "@/core/base/base-get.schema";
import type { IngestMessage } from "../../messaging.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagingMessageDirection, MessagingMessageOrigin, MessagingProvider } from "@/generated/prisma";

import { PermissionService } from "@/core/base/permission.service";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";

import { emailFolderFilterValue } from "../../inbox/messaging-filter-options.schema";
import { SweepEmailPresenceInteractor } from "../../ingest/backfill/sweep-email-presence.interactor";
import { UnipileRequestError } from "../../unipile-request-error";
import { PrismaConnectedAccountRepo } from "../prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "../prisma-unipile-webhook.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Listing = { id: string; message_id: string | null };

describeDatabase("mail deleted at an IMAP provider leaves the inbox after a presence sweep on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const imapAccountId = randomUUID();
  const gmailAccountId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId });
  const self = "owner@example.invalid";
  const folderIds = ["F_INBOX", "F_SENT", "F_SIGNALS", "F_TRASH"];
  const catalog = [
    { id: "F_INBOX", name: "INBOX", role: "INBOX", totalCount: null, unreadCount: null },
    { id: "F_SENT", name: "Sent", role: "SENT", totalCount: null, unreadCount: null },
    { id: "F_SIGNALS", name: "Signals", role: null, totalCount: null, unreadCount: null },
    { id: "F_TRASH", name: "Trash", role: "TRASH", totalCount: null, unreadCount: null },
  ];
  const day = 86400_000;

  const accounts = () =>
    new PrismaConnectedAccountRepo(
      new PermissionService(),
      new PrismaUnipileWebhookRepo(),
      new PrismaBillingUsageRepo(),
    );

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
    provider?: MessagingProvider;
    unipileMessageId: string;
    folderIds: string[];
    sentAt: Date;
    direction?: MessagingMessageDirection;
    origin?: MessagingMessageOrigin;
    unipileThreadId?: string;
  }): IngestMessage {
    const direction = args.direction ?? MessagingMessageDirection.inbound;
    const outbound = direction === MessagingMessageDirection.outbound;
    return {
      unipileMessageId: args.unipileMessageId,
      providerMessageId: `<${args.unipileMessageId}@example.invalid>`,
      unipileThreadId: args.unipileThreadId ?? `thread-${args.unipileMessageId}`,
      provider: args.provider ?? MessagingProvider.mail,
      direction,
      origin: args.origin ?? MessagingMessageOrigin.external,
      subject: "Synthetic alert",
      bodyHtml: `<p>${args.unipileMessageId}</p>`,
      bodyText: args.unipileMessageId,
      previewText: null,
      sender: attendee(outbound ? self : "alerts@example.invalid", outbound),
      recipients: { to: [attendee(outbound ? "alerts@example.invalid" : self, !outbound)], cc: [], bcc: [] },
      attachmentsMeta: [],
      folderIds: args.folderIds,
      reactions: [],
      isEvent: false,
      isDeleted: false,
      isHidden: false,
      sentAt: args.sentAt,
    };
  }

  async function ingest(connectedAccountId: string, message: IngestMessage) {
    await createTestMessagingRepo().ingestMessageUnscoped({
      companyId,
      connectedAccountId,
      backfill: false,
      message,
    });
  }

  async function row(connectedAccountId: string, unipileMessageId: string) {
    const { rows } = await client.query<{ folderIds: string[]; isHidden: boolean }>(
      'SELECT "folderIds", "isHidden" FROM "MessagingMessage" WHERE "connectedAccountId" = $1 AND "unipileMessageId" = $2',
      [connectedAccountId, unipileMessageId],
    );
    return rows[0];
  }

  async function threadOf(connectedAccountId: string, unipileMessageId: string) {
    const { rows } = await client.query<{ id: string }>(
      'SELECT "messagingThreadId" AS id FROM "MessagingMessage" WHERE "connectedAccountId" = $1 AND "unipileMessageId" = $2',
      [connectedAccountId, unipileMessageId],
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
    return items.map((item) => item.id).sort();
  }

  const unreadThreads = () => runWithTenant(owner, () => createTestMessagingRepo().countUnreadThreadsForCurrentUser());

  function provider(listings: Record<string, Listing[]>, overrides: Partial<Record<string, unknown>> = {}) {
    return {
      listFolders: vi.fn().mockResolvedValue({
        data: Object.keys(listings).map((id) => ({ object: "EmailFolder", id })),
        total_count: Object.keys(listings).length,
      }),
      listFolderEmails: vi
        .fn()
        .mockImplementation(({ folderId }: { folderId: string }) =>
          Promise.resolve({ data: listings[folderId] ?? [], next_cursor: null }),
        ),
      ...overrides,
    };
  }

  function sweeper(service: ReturnType<typeof provider>) {
    return new SweepEmailPresenceInteractor(accounts(), service as never, createTestMessagingRepo());
  }

  async function drain(service: ReturnType<typeof provider>, connectedAccountId = imapAccountId) {
    let cursor: string | null = null;
    for (;;) {
      const result = await sweeper(service).invoke({ connectedAccountId, cursor });
      if (result.done) return result;
      cursor = result.nextCursor;
    }
  }

  const listed = (unipileMessageId: string, messageId = `<${unipileMessageId}@example.invalid>`): Listing => ({
    id: unipileMessageId,
    message_id: messageId,
  });

  async function settle() {
    await client.query(
      `UPDATE "MessagingMessage" SET "createdAt" = NOW() - INTERVAL '1 hour', "updatedAt" = NOW() - INTERVAL '1 hour'
       WHERE "companyId" = $1`,
      [companyId],
    );
  }

  const now = Date.now();
  const providerTruth = (): Record<string, Listing[]> => ({
    F_INBOX: [listed("inbox-kept")],
    F_SENT: [listed("sent-elsewhere")],
    F_SIGNALS: [listed("signal-kept")],
    F_TRASH: [listed("signal-trashed-new-id", "<signal-trashed@example.invalid>")],
  });

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" (id,"updatedAt") VALUES ($1,NOW())', [companyId]);
    await client.query(
      'INSERT INTO "UserRole" (id,name,"isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$1,NOW())',
      [companyId],
    );
    await client.query(
      'INSERT INTO "User" (id,email,"firstName","lastName","companyId","roleId",status,"updatedAt") VALUES ($1,$2,\'Presence\',\'Owner\',$3,$3,\'active\',NOW())',
      [ownerId, `presence-owner-${ownerId}@example.invalid`, companyId],
    );
    for (const [id, providerName, sentFolderIds, selected] of [
      [imapAccountId, "mail", ["F_SENT"], ["F_INBOX", "F_SENT", "F_SIGNALS"]],
      [gmailAccountId, "google", ["SENT"], ["INBOX", "SENT"]],
    ] as const) {
      await client.query(
        `INSERT INTO "ConnectedAccount" (id,"companyId","userId",provider,"unipileAccountId",status,"emailAddress",
          folders,"selectedFolderIds","sentFolderIds","foldersSyncedAt","hasMessaging","updatedAt")
          VALUES ($1,$2,$3,$4,$1,'ok',$5,$6,$7,$8,NOW(),TRUE,NOW())`,
        [id, companyId, ownerId, providerName, self, JSON.stringify(catalog), selected, sentFolderIds],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE id = $1', [companyId]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "MessagingThread" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "MessagingFolderPassMessage" WHERE "companyId" = $1', [companyId]);

    for (const [id, days] of [
      ["signal-deleted-recent", 9],
      ["signal-deleted-old", 400],
      ["signal-kept", 3],
      ["signal-trashed", 5],
    ] as const) {
      await ingest(
        imapAccountId,
        email({ unipileMessageId: id, folderIds: ["F_SIGNALS"], sentAt: new Date(now - days * day) }),
      );
    }
    await ingest(
      imapAccountId,
      email({ unipileMessageId: "inbox-kept", folderIds: ["F_INBOX"], sentAt: new Date(now - day) }),
    );
    await ingest(
      imapAccountId,
      email({
        unipileMessageId: "sent-elsewhere",
        folderIds: ["F_SENT"],
        sentAt: new Date(now - day),
        direction: MessagingMessageDirection.outbound,
      }),
    );
    await runWithTenant(owner, () =>
      createTestMessagingRepo().persistOutboundMessageOrThrow({
        connectedAccountId: imapAccountId,
        message: email({
          unipileMessageId: "our-reply",
          folderIds: ["F_SENT"],
          sentAt: new Date(now - 8 * day),
          direction: MessagingMessageDirection.outbound,
          origin: MessagingMessageOrigin.unipile,
        }),
      }),
    );
    await ingest(
      gmailAccountId,
      email({
        provider: MessagingProvider.google,
        unipileMessageId: "gmail-alert",
        folderIds: ["INBOX"],
        sentAt: new Date(now - day),
      }),
    );
    await settle();
  });

  it("hides mail gone from every folder, older than any sync window too, and drops it from Signals and the unread count", async () => {
    const signalsBefore = await threadsInFolder(imapAccountId, "F_SIGNALS");
    const unreadBefore = await unreadThreads();
    expect(signalsBefore).toHaveLength(4);

    const result = await drain(provider(providerTruth()));

    expect(result).toEqual({ nextCursor: null, done: true, complete: true });
    expect(await row(imapAccountId, "signal-deleted-recent")).toEqual({ folderIds: [], isHidden: true });
    expect(await row(imapAccountId, "signal-deleted-old")).toEqual({ folderIds: [], isHidden: true });
    expect(await row(imapAccountId, "signal-kept")).toEqual({ folderIds: ["F_SIGNALS"], isHidden: false });
    expect(await row(imapAccountId, "signal-trashed")).toEqual({ folderIds: ["F_TRASH"], isHidden: false });
    expect(await row(imapAccountId, "inbox-kept")).toEqual({ folderIds: ["F_INBOX"], isHidden: false });
    expect(await row(imapAccountId, "sent-elsewhere")).toEqual({ folderIds: ["F_SENT"], isHidden: false });
    expect(await row(imapAccountId, "our-reply")).toEqual({ folderIds: ["F_SENT"], isHidden: false });
    expect(await row(gmailAccountId, "gmail-alert")).toEqual({ folderIds: ["INBOX"], isHidden: false });

    expect(await threadsInFolder(imapAccountId, "F_SIGNALS")).toEqual([await threadOf(imapAccountId, "signal-kept")]);
    expect(await threadsInFolder(imapAccountId, "F_SENT")).toEqual(
      [await threadOf(imapAccountId, "our-reply"), await threadOf(imapAccountId, "sent-elsewhere")].sort(),
    );
    expect(await unreadThreads()).toBe(unreadBefore - 3);
  });

  it("lists every folder of the account from the oldest stored mail on, with metadata only", async () => {
    const service = provider(providerTruth());

    await drain(service);

    const calls = service.listFolderEmails.mock.calls.map(([input]) => input);
    expect(calls.map((input) => input.folderId).sort()).toEqual(folderIds);
    for (const input of calls) {
      expect(input.metaOnly).toBe(true);
      expect(new Date(input.after).getTime()).toBeLessThan(now - 400 * day);
    }
  });

  it("hides nothing when a folder listing fails part way", async () => {
    const failure = new UnipileRequestError(503, "api/proxy_error", "{}");
    const service = provider(providerTruth(), {
      listFolderEmails: vi
        .fn()
        .mockImplementation(({ folderId }: { folderId: string }) =>
          folderId === "F_TRASH" ? Promise.reject(failure) : Promise.resolve({ data: [], next_cursor: null }),
        ),
    });

    await expect(drain(service)).rejects.toBe(failure);

    expect(await row(imapAccountId, "signal-deleted-recent")).toEqual({ folderIds: ["F_SIGNALS"], isHidden: false });
    expect(await row(imapAccountId, "inbox-kept")).toEqual({ folderIds: ["F_INBOX"], isHidden: false });
  });

  it.each([
    [
      "the folder list has more pages than it returned",
      {
        listFolders: vi.fn().mockResolvedValue({ data: [{ id: "F_SIGNALS" }], total_count: 4 }),
      },
    ],
    [
      "the folder list is empty",
      {
        listFolders: vi.fn().mockResolvedValue({ data: [], total_count: 0 }),
      },
    ],
    [
      "a folder can only be paged by an offset the provider refuses",
      {
        listFolderEmails: vi
          .fn()
          .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => listed(`filler-${index}`)) })
          .mockRejectedValue(
            new UnipileRequestError(
              400,
              "provider/invalid_parameters",
              '{"type":"provider/invalid_parameters","detail":"use cursor for pagination."}',
            ),
          ),
      },
    ],
    [
      "a listed mail cannot be read",
      {
        listFolderEmails: vi
          .fn()
          .mockResolvedValue({ data: [{ message_id: "<no-id@example.invalid>" }], next_cursor: null }),
      },
    ],
  ])("hides nothing when %s", async (_label, overrides) => {
    const result = await drain(provider(providerTruth(), overrides));

    expect(result.complete).toBe(false);
    expect(await row(imapAccountId, "signal-deleted-recent")).toEqual({ folderIds: ["F_SIGNALS"], isHidden: false });
    expect(await row(imapAccountId, "signal-kept")).toEqual({ folderIds: ["F_SIGNALS"], isHidden: false });
    const { rows } = await client.query('SELECT 1 FROM "MessagingFolderPassMessage" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("never hides a reply sent from the workspace, even when no folder lists it", async () => {
    await drain(provider({ F_INBOX: [], F_SENT: [], F_SIGNALS: [], F_TRASH: [] }));

    expect(await row(imapAccountId, "our-reply")).toEqual({ folderIds: ["F_SENT"], isHidden: false });
    expect(await row(imapAccountId, "sent-elsewhere")).toEqual({ folderIds: [], isHidden: true });
  });

  it("leaves a mail stored after the sweep started to the next sweep", async () => {
    const sweepStartedAt = new Date(Date.now() - 60_000);
    await client.query(
      `UPDATE "MessagingMessage" SET "createdAt" = NOW(), "updatedAt" = NOW()
       WHERE "connectedAccountId" = $1 AND "unipileMessageId" = 'signal-deleted-recent'`,
      [imapAccountId],
    );

    const outcome = await createTestMessagingRepo().reconcileEmailPresenceUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      startedAt: sweepStartedAt,
      sightings: [],
    });

    expect(await row(imapAccountId, "signal-deleted-recent")).toEqual({ folderIds: ["F_SIGNALS"], isHidden: false });
    expect(await row(imapAccountId, "signal-deleted-old")).toEqual({ folderIds: [], isHidden: true });
    expect(outcome.hidden).toBe(5);
  });

  it("leaves Gmail accounts to their own sync", async () => {
    const service = provider({});

    const result = await drain(service, gmailAccountId);

    expect(result.complete).toBe(false);
    expect(service.listFolders).not.toHaveBeenCalled();
    expect(await row(gmailAccountId, "gmail-alert")).toEqual({ folderIds: ["INBOX"], isHidden: false });
  });

  it("brings a hidden mail back when the provider lists it again", async () => {
    await drain(provider({ F_INBOX: [], F_SENT: [], F_SIGNALS: [], F_TRASH: [] }));
    expect(await row(imapAccountId, "signal-kept")).toEqual({ folderIds: [], isHidden: true });

    await createTestMessagingRepo().ingestMessageUnscoped({
      companyId,
      connectedAccountId: imapAccountId,
      backfill: true,
      message: email({ unipileMessageId: "signal-kept", folderIds: ["F_SIGNALS"], sentAt: new Date(now - 3 * day) }),
    });

    expect(await row(imapAccountId, "signal-kept")).toEqual({ folderIds: ["F_SIGNALS"], isHidden: false });
  });
});
