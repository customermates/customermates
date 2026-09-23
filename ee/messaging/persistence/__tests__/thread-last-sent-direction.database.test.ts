import type { MessagingAttendee } from "../../messaging.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
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

describeDatabase("the latest sent message of a thread on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const accountId = randomUUID();
  const ownerEmail = `last-sent-owner-${ownerId}@example.invalid`;
  const customerEmail = `last-sent-customer-${ownerId}@example.invalid`;
  const tenant = createMockUser({ id: ownerId, companyId, email: ownerEmail }) satisfies TenantUser;
  const repo = new PrismaMessagingRepo();

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, ownerEmail, "Last", "Sent", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, MessagingProvider.google, `unipile-${accountId}`, "ok", ownerEmail],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  async function threadWith(history: ("inbound" | "outbound")[]) {
    const threadId = randomUUID();
    const lastMessageAt = new Date(Date.now() - 60_000);
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "lastMessageAt", "lastMessageIsSender", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)',
      [
        threadId,
        companyId,
        accountId,
        MessagingProvider.google,
        "single",
        `thread-${threadId}`,
        lastMessageAt.toISOString(),
        history.at(-1) === "outbound",
      ],
    );
    for (const [index, direction] of history.entries()) {
      const sender = direction === "outbound" ? attendee(ownerEmail, true) : attendee(customerEmail);
      await client.query(
        `INSERT INTO "MessagingMessage"
           ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider",
            "direction", "origin", "sender", "recipients", "bodyText", "isDraft", "sentAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'unipile', $8::jsonb, $9::jsonb, $10, false, $11, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          companyId,
          threadId,
          accountId,
          `message-${randomUUID()}`,
          MessagingProvider.google,
          direction,
          JSON.stringify(sender),
          JSON.stringify({ to: [], cc: [], bcc: [] }),
          `${direction} ${index}`,
          new Date(lastMessageAt.getTime() - (history.length - 1 - index) * 1_000).toISOString(),
        ],
      );
    }
    return threadId;
  }

  function saveDraftReply(threadId: string) {
    return runWithTenant(tenant, () =>
      repo.upsertThreadDraftOrThrow({
        threadId,
        connectedAccountId: accountId,
        provider: MessagingProvider.google,
        sender: attendee(ownerEmail, true),
        subject: "Re: Pilot",
        bodyText: "Draft reply, not sent yet",
        recipients: { to: [attendee(customerEmail)], cc: [], bcc: [] },
      }),
    );
  }

  async function readBothWays(threadId: string) {
    const detail = await runWithTenant(tenant, () => repo.findThreadById(threadId));
    const listed = await runWithTenant(tenant, () => repo.getItems({ pagination: { page: 1, pageSize: 100 } }));
    const row = listed.find((thread) => thread.id === threadId);
    return [detail, row].map((thread) => ({
      lastMessageFromSelf: thread?.lastMessageFromSelf,
      lastSentMessageFromSelf: thread?.lastSentMessageFromSelf,
    }));
  }

  it("keeps a thread awaiting a reply once a draft reply is saved, while the inbox still shows the draft as ours", async () => {
    const threadId = await threadWith(["outbound", "inbound"]);
    await saveDraftReply(threadId);

    expect(await readBothWays(threadId)).toEqual([
      { lastMessageFromSelf: true, lastSentMessageFromSelf: false },
      { lastMessageFromSelf: true, lastSentMessageFromSelf: false },
    ]);
  });

  it("keeps a thread answered when a draft sits on top of our own sent reply", async () => {
    const threadId = await threadWith(["inbound", "outbound"]);
    await saveDraftReply(threadId);

    expect(await readBothWays(threadId)).toEqual([
      { lastMessageFromSelf: true, lastSentMessageFromSelf: true },
      { lastMessageFromSelf: true, lastSentMessageFromSelf: true },
    ]);
  });

  it("says nothing was sent yet when the thread holds only a draft", async () => {
    const threadId = await threadWith([]);
    await saveDraftReply(threadId);

    expect(await readBothWays(threadId)).toEqual([
      { lastMessageFromSelf: true, lastSentMessageFromSelf: null },
      { lastMessageFromSelf: true, lastSentMessageFromSelf: null },
    ]);
  });

  it("reads the newest message directly when the thread holds no draft", async () => {
    const waiting = await threadWith(["outbound", "inbound"]);
    const answered = await threadWith(["inbound", "outbound"]);

    expect(await readBothWays(waiting)).toEqual([
      { lastMessageFromSelf: false, lastSentMessageFromSelf: false },
      { lastMessageFromSelf: false, lastSentMessageFromSelf: false },
    ]);
    expect(await readBothWays(answered)).toEqual([
      { lastMessageFromSelf: true, lastSentMessageFromSelf: true },
      { lastMessageFromSelf: true, lastSentMessageFromSelf: true },
    ]);
  });
});
