import type { MessagingAttendee } from "../../messaging.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { draftThreadProviderId } from "../../draft-thread";
import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function attendee(identifier: string, isSelf = false): MessagingAttendee {
  return {
    attendeeId: identifier,
    identifier,
    displayName: null,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf,
    contact: null,
  };
}

describeDatabase("draft lifecycle persistence on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const accountId = randomUUID();
  const ownerEmail = `draft-owner-${ownerId}@example.invalid`;
  const tenant = createMockUser({
    id: ownerId,
    companyId,
    email: ownerEmail,
  }) satisfies TenantUser;

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, ownerEmail, "Draft", "Owner", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, MessagingProvider.google, `unipile-${accountId}`, "ok", ownerEmail],
    );
  });

  it("has a partial thread lookup index for draft filters", async () => {
    const indexes = await client.query(
      `SELECT indexdef
       FROM pg_indexes
       WHERE schemaname = current_schema()
         AND tablename = 'MessagingMessage'
         AND indexname = 'MessagingMessage_messagingThreadId_isDraft_idx'`,
    );

    expect(indexes.rows).toHaveLength(1);
    expect(indexes.rows[0].indexdef).toContain('("messagingThreadId")');
    expect(indexes.rows[0].indexdef).toMatch(/WHERE \("isDraft" = true\)$/);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  async function insertMessage(args: {
    threadId: string;
    unipileMessageId: string;
    providerMessageId?: string | null;
    isDraft: boolean;
    origin?: "external" | "unipile";
    bodyText?: string;
    sentAt?: Date;
  }) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "MessagingMessage"
         ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId",
          "providerMessageId", "provider", "direction", "origin", "sender", "recipients",
          "bodyText", "isDraft", "sentAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, CURRENT_TIMESTAMP)`,
      [
        id,
        companyId,
        args.threadId,
        accountId,
        args.unipileMessageId,
        args.providerMessageId ?? null,
        MessagingProvider.google,
        "outbound",
        args.origin ?? "unipile",
        JSON.stringify(attendee(ownerEmail, true)),
        JSON.stringify({ to: [], cc: [], bcc: [] }),
        args.bodyText ?? "Seeded message",
        args.isDraft,
        args.sentAt ?? new Date(),
      ],
    );
    return id;
  }

  async function replaceDraftRevision(args: {
    messageId: string;
    threadId: string;
    previousUpdatedAt: Date;
    bodyText: string;
  }) {
    const updatedAt = new Date(args.previousUpdatedAt.getTime() + 1_000);
    const sentAt = updatedAt;
    await client.query(
      `UPDATE "MessagingMessage"
       SET "bodyText" = $2, "sentAt" = $3, "updatedAt" = $4
       WHERE "id" = $1`,
      [args.messageId, args.bodyText, sentAt, updatedAt],
    );
    await client.query(
      `UPDATE "MessagingThread"
       SET "lastMessageAt" = $2, "lastMessagePreview" = $3, "lastMessageIsSender" = TRUE
       WHERE "id" = $1`,
      [args.threadId, sentAt, args.bodyText],
    );
    return { sentAt, updatedAt };
  }

  it("creates a cold-draft shell instead of reusing a real thread with the same recipient", async () => {
    const recipient = `existing-${randomUUID()}@example.invalid`;
    const realThreadId = randomUUID();
    const realProviderThreadId = `provider-thread-${randomUUID()}`;

    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [realThreadId, companyId, accountId, MessagingProvider.google, "single", realProviderThreadId],
    );
    await client.query(
      'INSERT INTO "MessagingThreadParticipant" ("id", "companyId", "messagingThreadId", "provider", "providerUserId", "identifier", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [randomUUID(), companyId, realThreadId, MessagingProvider.google, recipient, recipient],
    );

    const draftThread = await runWithTenant(tenant, () =>
      new PrismaMessagingRepo().findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: [recipient],
      }),
    );

    expect(draftThread.id).not.toBe(realThreadId);
    expect(draftThread.unipileThreadId).toBe(draftThreadProviderId(MessagingProvider.google, [recipient]));

    const rows = await client.query(
      'SELECT "id", "unipileThreadId" FROM "MessagingThread" WHERE "id" = ANY($1::text[]) ORDER BY "id"',
      [[realThreadId, draftThread.id]],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row) => row.unipileThreadId)).toContain(realProviderThreadId);
  });

  it("returns one deterministic shell under concurrent find-or-create calls", async () => {
    const recipient = `concurrent-thread-${randomUUID()}@example.invalid`;
    const recipients = [recipient];
    const expectedProviderId = draftThreadProviderId(MessagingProvider.google, recipients);

    const results = await runWithTenant(tenant, () =>
      Promise.all(
        Array.from({ length: 12 }, () =>
          new PrismaMessagingRepo().findOrCreateDraftThread({
            connectedAccountId: accountId,
            provider: MessagingProvider.google,
            recipients,
          }),
        ),
      ),
    );

    expect(new Set(results.map((thread) => thread.id)).size).toBe(1);
    expect(new Set(results.map((thread) => thread.unipileThreadId))).toEqual(new Set([expectedProviderId]));

    const count = await client.query(
      'SELECT COUNT(*)::int AS count FROM "MessagingThread" WHERE "connectedAccountId" = $1 AND "unipileThreadId" = $2',
      [accountId, expectedProviderId],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("canonicalizes a multi-recipient draft and creates every participant with group semantics", async () => {
    const first = `multi-a-${randomUUID()}@example.invalid`;
    const second = `multi-b-${randomUUID()}@example.invalid`;
    const submitted = [second, first, second];

    const thread = await runWithTenant(tenant, () =>
      new PrismaMessagingRepo().findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: submitted,
      }),
    );

    expect(thread.unipileThreadId).toBe(draftThreadProviderId(MessagingProvider.google, [first, second]));

    const storedThread = await client.query('SELECT "type" FROM "MessagingThread" WHERE "id" = $1', [thread.id]);
    expect(storedThread.rows[0].type).toBe("group");

    const participants = await client.query(
      'SELECT "identifier", "providerUserId", "isSelf" FROM "MessagingThreadParticipant" WHERE "messagingThreadId" = $1 ORDER BY "identifier"',
      [thread.id],
    );
    expect(participants.rows).toEqual([
      { identifier: first, providerUserId: first, isSelf: false },
      { identifier: second, providerUserId: second, isSelf: false },
    ]);
  });

  it("keeps one deterministic draft row across repeated and concurrent saves", async () => {
    const recipient = `concurrent-message-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const thread = await runWithTenant(tenant, () =>
      repo.findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: [recipient],
      }),
    );
    const recipients = { to: [attendee(recipient)], cc: [], bcc: [] };
    const save = (bodyText: string) =>
      repo.upsertThreadDraftOrThrow({
        threadId: thread.id,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "One draft",
        bodyText,
        recipients,
      });

    const first = await runWithTenant(tenant, () => save("first"));
    const second = await runWithTenant(tenant, () => save("second"));
    expect(second.id).toBe(first.id);

    const draftTarget = await runWithTenant(tenant, () => repo.findDraftById({ messageId: first.id }));
    expect(draftTarget?.recipientIdentifiers).toEqual([recipient]);

    const bodies = Array.from({ length: 12 }, (_, index) => `parallel-${index}`);
    const concurrent = await runWithTenant(tenant, () => Promise.all(bodies.map(save)));
    expect(new Set(concurrent.map((draft) => draft.id))).toEqual(new Set([first.id]));

    const stored = await client.query(
      'SELECT "id", "messagingThreadId", "unipileMessageId", "bodyText", "isDraft" FROM "MessagingMessage" WHERE "messagingThreadId" = $1',
      [thread.id],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      id: first.id,
      messagingThreadId: thread.id,
      unipileMessageId: `draft_${thread.id}`,
      isDraft: true,
    });
    expect(bodies).toContain(stored.rows[0].bodyText);
  });

  it("keeps the appended signature out of the thread preview", async () => {
    const recipient = `signature-preview-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const unipileThreadId = `thread-${randomUUID()}`;
    const bodyText = "Short message body.\n\n-- \nAda Lovelace\nHead of Engineering, Example\nada@example.invalid";
    const bodyHtml =
      '<div data-customermates-email-body="true">Short message body.</div>' +
      '<div data-customermates-signature="true"><strong>Ada Lovelace</strong><br>Head of Engineering, Example</div>';
    await runWithTenant(tenant, () =>
      repo.persistOutboundMessageOrThrow({
        connectedAccountId: accountId,
        message: {
          unipileMessageId: `sent-${randomUUID()}`,
          providerMessageId: null,
          provider: MessagingProvider.google,
          direction: "outbound",
          origin: "unipile",
          sender: attendee(ownerEmail, true),
          recipients: { to: [attendee(recipient)], cc: [], bcc: [] },
          subject: "Signature preview",
          bodyText,
          bodyHtml,
          attachmentsMeta: [],
          isEvent: false,
          isDeleted: false,
          isHidden: false,
          sentAt: new Date(),
          reactions: [],
          unipileThreadId,
          threadType: "single",
        },
      }),
    );

    const summary = await client.query(
      'SELECT "lastMessagePreview" FROM "MessagingThread" WHERE "unipileThreadId" = $1',
      [unipileThreadId],
    );

    expect(summary.rows).toEqual([{ lastMessagePreview: "Short message body." }]);
  });

  it("persists interactor-rendered draft HTML and reuses its text for summary repair", async () => {
    const recipient = `rendered-draft-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const thread = await runWithTenant(tenant, () =>
      repo.findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: [recipient],
      }),
    );
    const bodyText = "**Review** [project](https://example.com)";
    const bodyHtml = '<div><strong>Review</strong> <a href="https://example.com">project</a></div>';
    const draft = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: thread.id,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Rendered draft",
        bodyText,
        bodyHtml,
        recipients: { to: [attendee(recipient)], cc: [], bcc: [] },
      }),
    );
    expect(draft.bodyText).toBe(bodyText);
    expect(draft.bodyHtml).toBe(bodyHtml);
    await runWithTenant(tenant, () => repo.restoreDraftSummaryIfPresent({ messageId: draft.id }));
    const summary = await client.query('SELECT "lastMessagePreview" FROM "MessagingThread" WHERE "id" = $1', [
      thread.id,
    ]);
    expect(summary.rows).toEqual([{ lastMessagePreview: "Review project (https://example.com)" }]);
  });

  it("upgrades a legacy randomized draft in place without creating a second draft", async () => {
    const recipient = `legacy-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const thread = await runWithTenant(tenant, () =>
      repo.findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: [recipient],
      }),
    );
    const legacyId = await insertMessage({
      threadId: thread.id,
      unipileMessageId: `draft_${randomUUID()}`,
      isDraft: true,
      origin: "external",
      bodyText: "Legacy body",
    });

    const upgraded = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: thread.id,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Upgraded legacy draft",
        bodyText: "Updated body",
        recipients: { to: [attendee(recipient)], cc: [], bcc: [] },
      }),
    );

    expect(upgraded.id).toBe(legacyId);
    const stored = await client.query(
      'SELECT "id", "unipileMessageId", "bodyText" FROM "MessagingMessage" WHERE "messagingThreadId" = $1 AND "isDraft" = TRUE',
      [thread.id],
    );
    expect(stored.rows).toEqual([
      {
        id: legacyId,
        unipileMessageId: `draft_${thread.id}`,
        bodyText: "Updated body",
      },
    ]);
  });

  it("reconciles a provider copy on its actual thread and restores the source summary", async () => {
    const recipient = `provider-copy-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const sourceThreadId = randomUUID();
    const providerThreadId = randomUUID();
    await client.query(
      `INSERT INTO "MessagingThread"
         ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP),
              ($7, $2, $3, $4, $5, $8, CURRENT_TIMESTAMP)`,
      [
        sourceThreadId,
        companyId,
        accountId,
        MessagingProvider.google,
        "single",
        `source-thread-${randomUUID()}`,
        providerThreadId,
        `provider-thread-${randomUUID()}`,
      ],
    );
    const sourceSentAt = new Date(Date.now() - 120_000);
    await insertMessage({
      threadId: sourceThreadId,
      unipileMessageId: `source-message-${randomUUID()}`,
      isDraft: false,
      bodyText: "Source history",
      sentAt: sourceSentAt,
    });
    const recipients = { to: [attendee(recipient)], cc: [], bcc: [] };
    const draft = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: sourceThreadId,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Provider copy race",
        bodyText: "Draft body",
        recipients,
      }),
    );
    const providerUnipileId = `provider-${randomUUID()}`;
    const providerMessageId = `<provider-${randomUUID()}@example.invalid>`;
    const providerSentAt = new Date(Date.now() - 30_000);
    const providerCopyId = await insertMessage({
      threadId: providerThreadId,
      unipileMessageId: providerUnipileId,
      providerMessageId,
      isDraft: false,
      bodyText: "Already ingested",
      sentAt: providerSentAt,
    });
    const sentAt = new Date();

    const converted = await runWithTenant(tenant, () =>
      repo.convertDraftToSent({
        messageId: draft.id,
        expectedUpdatedAt: draft.updatedAt,
        unipileMessageId: providerUnipileId,
        providerMessageId,
        sender: attendee(ownerEmail, true),
        recipients,
        subject: "Provider copy race",
        bodyText: "Sent body",
        bodyHtml: null,
        attachmentsMeta: [],
        sentAt,
      }),
    );

    expect(converted?.id).toBe(providerCopyId);
    const rows = await client.query(
      'SELECT "id", "isDraft", "unipileMessageId" FROM "MessagingMessage" WHERE "id" = ANY($1::text[]) ORDER BY "id"',
      [[draft.id, providerCopyId]],
    );
    expect(rows.rows).toEqual([
      {
        id: providerCopyId,
        isDraft: false,
        unipileMessageId: providerUnipileId,
      },
    ]);

    const summaries = await client.query(
      `SELECT "id", "lastMessageAt", "lastMessagePreview", "lastMessageIsSender"
       FROM "MessagingThread"
       WHERE "id" = ANY($1::text[])`,
      [[sourceThreadId, providerThreadId]],
    );
    expect(summaries.rows).toHaveLength(2);
    expect(summaries.rows.find((row) => row.id === sourceThreadId)).toEqual({
      id: sourceThreadId,
      lastMessageAt: sourceSentAt,
      lastMessagePreview: "Source history",
      lastMessageIsSender: true,
    });
    expect(summaries.rows.find((row) => row.id === providerThreadId)).toEqual({
      id: providerThreadId,
      lastMessageAt: providerSentAt,
      lastMessagePreview: "Already ingested",
      lastMessageIsSender: true,
    });
  });

  it("preserves a newer reply-draft revision while persisting the sent provider message", async () => {
    const recipient = `revision-race-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const threadId = randomUUID();
    const unipileThreadId = `revision-thread-${randomUUID()}`;
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [threadId, companyId, accountId, MessagingProvider.google, "single", unipileThreadId],
    );
    const recipients = { to: [attendee(recipient)], cc: [], bcc: [] };
    const firstRevision = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Revision race",
        bodyText: "First revision",
        recipients,
      }),
    );
    const logicalSentAt = firstRevision.sentAt;
    const secondRevision = await replaceDraftRevision({
      messageId: firstRevision.id,
      threadId,
      previousUpdatedAt: firstRevision.updatedAt,
      bodyText: "Newer revision",
    });
    const unipileMessageId = `sent-${randomUUID()}`;

    const converted = await runWithTenant(tenant, () =>
      repo.convertDraftToSent({
        messageId: firstRevision.id,
        expectedUpdatedAt: firstRevision.updatedAt,
        unipileMessageId,
        providerMessageId: null,
        sender: attendee(ownerEmail, true),
        recipients,
        subject: "Revision race",
        bodyText: "First revision",
        bodyHtml: null,
        attachmentsMeta: [],
        sentAt: logicalSentAt,
      }),
    );
    expect(converted).toBeNull();

    const persisted = await runWithTenant(tenant, () =>
      repo.persistOutboundMessageOrThrow({
        connectedAccountId: accountId,
        message: {
          unipileMessageId,
          providerMessageId: null,
          provider: MessagingProvider.google,
          direction: "outbound",
          origin: "unipile",
          sender: attendee(ownerEmail, true),
          recipients,
          subject: "Revision race",
          bodyText: "First revision",
          bodyHtml: null,
          attachmentsMeta: [],
          isEvent: false,
          isDeleted: false,
          isHidden: false,
          sentAt: logicalSentAt,
          reactions: [],
          unipileThreadId,
          threadType: "single",
        },
      }),
    );
    await runWithTenant(tenant, () => repo.restoreDraftSummaryIfPresent({ messageId: firstRevision.id }));

    expect(persisted.id).not.toBe(firstRevision.id);
    const messages = await client.query(
      `SELECT "id", "isDraft", "bodyText", "updatedAt"
       FROM "MessagingMessage"
       WHERE "messagingThreadId" = $1
       ORDER BY "isDraft" DESC`,
      [threadId],
    );
    expect(messages.rows).toEqual([
      {
        id: firstRevision.id,
        isDraft: true,
        bodyText: "Newer revision",
        updatedAt: secondRevision.updatedAt,
      },
      {
        id: persisted.id,
        isDraft: false,
        bodyText: "First revision",
        updatedAt: expect.any(Date),
      },
    ]);
    const summary = await client.query(
      'SELECT "lastMessageAt", "lastMessagePreview", "lastMessageIsSender" FROM "MessagingThread" WHERE "id" = $1',
      [threadId],
    );
    expect(summary.rows).toEqual([
      {
        lastMessageAt: secondRevision.sentAt,
        lastMessagePreview: "Newer revision",
        lastMessageIsSender: true,
      },
    ]);
  });

  it("returns an existing provider copy without consuming a newer draft revision", async () => {
    const recipient = `provider-revision-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const sourceThreadId = randomUUID();
    const providerThreadId = randomUUID();
    await client.query(
      `INSERT INTO "MessagingThread"
         ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP),
              ($7, $2, $3, $4, $5, $8, CURRENT_TIMESTAMP)`,
      [
        sourceThreadId,
        companyId,
        accountId,
        MessagingProvider.google,
        "single",
        `source-revision-${randomUUID()}`,
        providerThreadId,
        `provider-revision-${randomUUID()}`,
      ],
    );
    const recipients = { to: [attendee(recipient)], cc: [], bcc: [] };
    const firstRevision = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: sourceThreadId,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Provider revision race",
        bodyText: "First provider revision",
        recipients,
      }),
    );
    const secondRevision = await replaceDraftRevision({
      messageId: firstRevision.id,
      threadId: sourceThreadId,
      previousUpdatedAt: firstRevision.updatedAt,
      bodyText: "Newer provider revision",
    });
    const providerUnipileId = `provider-revision-message-${randomUUID()}`;
    const providerCopyId = await insertMessage({
      threadId: providerThreadId,
      unipileMessageId: providerUnipileId,
      isDraft: false,
      bodyText: "Already ingested provider copy",
    });

    const converted = await runWithTenant(tenant, () =>
      repo.convertDraftToSent({
        messageId: firstRevision.id,
        expectedUpdatedAt: firstRevision.updatedAt,
        unipileMessageId: providerUnipileId,
        providerMessageId: null,
        sender: attendee(ownerEmail, true),
        recipients,
        subject: "Provider revision race",
        bodyText: "First provider revision",
        bodyHtml: null,
        attachmentsMeta: [],
        sentAt: firstRevision.sentAt,
      }),
    );

    expect(converted?.id).toBe(providerCopyId);
    const draft = await client.query(
      'SELECT "isDraft", "bodyText", "updatedAt" FROM "MessagingMessage" WHERE "id" = $1',
      [firstRevision.id],
    );
    expect(draft.rows).toEqual([
      {
        isDraft: true,
        bodyText: "Newer provider revision",
        updatedAt: secondRevision.updatedAt,
      },
    ]);
    const summary = await client.query(
      'SELECT "lastMessageAt", "lastMessagePreview" FROM "MessagingThread" WHERE "id" = $1',
      [sourceThreadId],
    );
    expect(summary.rows).toEqual([
      {
        lastMessageAt: secondRevision.sentAt,
        lastMessagePreview: "Newer provider revision",
      },
    ]);
  });

  it("uses the prior sent email reference when the newest message is a draft", async () => {
    const recipient = `reply-reference-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const thread = await runWithTenant(tenant, () =>
      repo.findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: [recipient],
      }),
    );
    const providerMessageId = `<reply-${randomUUID()}@example.invalid>`;
    await insertMessage({
      threadId: thread.id,
      unipileMessageId: `prior-${randomUUID()}`,
      providerMessageId,
      isDraft: false,
      sentAt: new Date(Date.now() - 60_000),
    });
    await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: thread.id,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Reply draft",
        bodyText: "Newest draft",
        recipients: { to: [attendee(recipient)], cc: [], bcc: [] },
      }),
    );

    const reference = await runWithTenant(tenant, () => repo.findLatestEmailReplyReferenceForThread(thread.id));
    expect(reference).toBe(providerMessageId);
  });

  it("deletes the empty cold-draft shell and its participants after send", async () => {
    const recipient = `discard-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const thread = await runWithTenant(tenant, () =>
      repo.findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: [recipient],
      }),
    );
    const draft = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: thread.id,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Discard me",
        bodyText: "No longer needed",
        recipients: { to: [attendee(recipient)], cc: [], bcc: [] },
      }),
    );

    await runWithTenant(tenant, () =>
      repo.discardDraftAfterSend({
        messageId: draft.id,
        expectedUpdatedAt: draft.updatedAt,
      }),
    );

    const remaining = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "MessagingThread" WHERE "id" = $1) AS threads,
         (SELECT COUNT(*)::int FROM "MessagingMessage" WHERE "messagingThreadId" = $1) AS messages,
         (SELECT COUNT(*)::int FROM "MessagingThreadParticipant" WHERE "messagingThreadId" = $1) AS participants`,
      [thread.id],
    );
    expect(remaining.rows[0]).toEqual({
      threads: 0,
      messages: 0,
      participants: 0,
    });
  });

  it("keeps a newer cold draft, shell, and participants after stale cleanup attempts", async () => {
    const recipient = `stale-discard-${randomUUID()}@example.invalid`;
    const repo = new PrismaMessagingRepo();
    const thread = await runWithTenant(tenant, () =>
      repo.findOrCreateDraftThread({
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        recipients: [recipient],
      }),
    );
    const firstRevision = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId: thread.id,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Cold revision race",
        bodyText: "First cold revision",
        recipients: { to: [attendee(recipient)], cc: [], bcc: [] },
      }),
    );
    const secondRevision = await replaceDraftRevision({
      messageId: firstRevision.id,
      threadId: thread.id,
      previousUpdatedAt: firstRevision.updatedAt,
      bodyText: "Newer cold revision",
    });

    await runWithTenant(tenant, () =>
      repo.discardDraftAfterSend({
        messageId: firstRevision.id,
        expectedUpdatedAt: firstRevision.updatedAt,
      }),
    );
    const explicitDiscard = await runWithTenant(tenant, () =>
      repo.deleteDraft({
        messageId: firstRevision.id,
        expectedUpdatedAt: firstRevision.updatedAt,
      }),
    );
    expect(explicitDiscard).toEqual({ status: "revision_mismatch" });

    const remaining = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "MessagingThread" WHERE "id" = $1) AS threads,
         (SELECT COUNT(*)::int FROM "MessagingThreadParticipant" WHERE "messagingThreadId" = $1) AS participants,
         "isDraft", "bodyText", "updatedAt"
       FROM "MessagingMessage"
       WHERE "id" = $2`,
      [thread.id, firstRevision.id],
    );
    expect(remaining.rows).toEqual([
      {
        threads: 1,
        participants: 1,
        isDraft: true,
        bodyText: "Newer cold revision",
        updatedAt: secondRevision.updatedAt,
      },
    ]);
    const summary = await client.query(
      'SELECT "lastMessageAt", "lastMessagePreview" FROM "MessagingThread" WHERE "id" = $1',
      [thread.id],
    );
    expect(summary.rows).toEqual([
      {
        lastMessageAt: secondRevision.sentAt,
        lastMessagePreview: "Newer cold revision",
      },
    ]);
  });

  it("serializes concurrent draft deletion and restores the source summary once", async () => {
    const recipient = `concurrent-discard-${randomUUID()}@example.invalid`;
    const threadId = randomUUID();
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [threadId, companyId, accountId, MessagingProvider.google, "single", `discard-thread-${randomUUID()}`],
    );
    const previousSentAt = new Date(Date.now() - 60_000);
    await insertMessage({
      threadId,
      unipileMessageId: `previous-${randomUUID()}`,
      isDraft: false,
      bodyText: "Previous message",
      sentAt: previousSentAt,
    });
    const repo = new PrismaMessagingRepo();
    const draft = await runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Concurrent discard",
        bodyText: "Draft preview",
        recipients: { to: [attendee(recipient)], cc: [], bcc: [] },
      }),
    );

    const results = await runWithTenant(tenant, () =>
      Promise.all([
        new PrismaMessagingRepo().deleteDraft({
          messageId: draft.id,
          expectedUpdatedAt: draft.updatedAt,
        }),
        new PrismaMessagingRepo().deleteDraft({
          messageId: draft.id,
          expectedUpdatedAt: draft.updatedAt,
        }),
      ]),
    );

    expect(results).toEqual(
      expect.arrayContaining([{ status: "deleted", messagingThreadId: threadId }, { status: "not_found" }]),
    );
    const stored = await client.query(
      `SELECT
         "lastMessageAt", "lastMessagePreview", "lastMessageIsSender",
         (SELECT COUNT(*)::int FROM "MessagingMessage" WHERE "messagingThreadId" = $1 AND "isDraft" = TRUE) AS drafts
       FROM "MessagingThread"
       WHERE "id" = $1`,
      [threadId],
    );
    expect(stored.rows).toEqual([
      {
        lastMessageAt: previousSentAt,
        lastMessagePreview: "Previous message",
        lastMessageIsSender: true,
        drafts: 0,
      },
    ]);
  });
});
