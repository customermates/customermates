import type { IngestMessage } from "../../messaging.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MessagingMessageDirection, MessagingMessageOrigin, MessagingProvider } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("outbound Bcc retention on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const accountId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId });
  const attendee = (identifier: string, isSelf = false) => ({
    attendeeId: identifier,
    identifier,
    displayName: null,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf,
  });
  const message = (bcc: string[]): IngestMessage => ({
    unipileMessageId: `sent-${accountId}`,
    providerMessageId: `<sent-${accountId}@example.invalid>`,
    unipileThreadId: `thread-${accountId}`,
    provider: MessagingProvider.mail,
    direction: MessagingMessageDirection.outbound,
    origin: MessagingMessageOrigin.external,
    subject: "Synthetic Bcc-only",
    bodyHtml: "<p>synthetic</p>",
    bodyText: "synthetic",
    previewText: null,
    sender: attendee("owner@example.invalid", true),
    recipients: { to: [], cc: [], bcc: bcc.map((email) => attendee(email)) },
    attachmentsMeta: [],
    folderIds: [],
    reactions: [],
    isEvent: false,
    isDeleted: false,
    isHidden: false,
    sentAt: new Date("2026-10-04T08:00:00.000Z"),
  });

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, `bcc-owner-${ownerId}@example.invalid`, "Bcc", "Owner", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "updatedAt") VALUES ($1, $2, $3, \'mail\', $4, \'ok\', \'owner@example.invalid\', CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, `synthetic-bcc-retention-${accountId}`],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("restores the owner's Bcc on a Sent copy that was ingested before the send was adopted", async () => {
    const repo = new PrismaMessagingRepo();
    await runWithTenant(owner, () =>
      repo.persistOutboundMessageOrThrow({ connectedAccountId: accountId, message: message([]) }),
    );

    const adopted = await runWithTenant(owner, () =>
      repo.persistOutboundMessageOrThrow({
        connectedAccountId: accountId,
        message: message(["hidden@example.invalid"]),
      }),
    );

    const stored = await client.query('SELECT "recipients" FROM "MessagingMessage" WHERE "connectedAccountId" = $1', [
      accountId,
    ]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].recipients.bcc.map((r: { identifier: string }) => r.identifier)).toEqual([
      "hidden@example.invalid",
    ]);
    expect((adopted.recipients as { bcc: unknown[] }).bcc).toHaveLength(1);
  });
});
