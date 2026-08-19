import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("a misrouted message.update cannot move a message or rewrite its sender", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const accountId = randomUUID();
  const ownerId = randomUUID();
  const unipileMessageId = `msg-${randomUUID()}`;
  const counterpartChat = `counterpart-${randomUUID()}@lid`;
  const selfChat = `self-${randomUUID()}@lid`;

  function attendee(name: string, identifier: string, isSelf: boolean) {
    return { attendeeId: identifier, displayName: name, identifier, isSelf, provider: "whatsapp" } as never;
  }

  function payload(chatId: string, sender: ReturnType<typeof attendee>, bodyText: string, editedAt?: Date) {
    return {
      unipileMessageId,
      unipileThreadId: chatId,
      threadType: "single",
      provider: "whatsapp",
      direction: "inbound",
      origin: "unipile",
      sender,
      recipients: { to: [], cc: [], bcc: [] },
      bodyText,
      bodyHtml: null,
      subject: null,
      attachmentsMeta: [],
      folderIds: [],
      isDraft: false,
      isHidden: false,
      sentAt: new Date("2026-08-19T15:00:00.000Z"),
      ...(editedAt ? { editedAt } : {}),
    } as never;
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, `misroute-${ownerId}@example.com`, "Misroute", "Owner", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, "whatsapp", `unipile-${accountId}`, "ok"],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("keeps the message in its original chat and preserves its sender", async () => {
    const repo = new PrismaMessagingRepo();
    const counterpart = attendee("Carla", "+491000000001", false);
    const owner = attendee("You", "+491000000002", true);

    await runWithoutTenant(() =>
      repo.ingestMessageUnscoped({
        companyId,
        connectedAccountId: accountId,
        message: payload(counterpartChat, counterpart, "original from the counterpart"),
        backfill: false,
      }),
    );

    await runWithoutTenant(() =>
      repo.ingestMessageUnscoped({
        companyId,
        connectedAccountId: accountId,
        message: payload(selfChat, owner, "edited and misrouted", new Date("2026-08-19T15:00:10.000Z")),
        backfill: false,
      }),
    );

    const message = await client.query(
      `SELECT m."bodyText", m."editedAt", m."sender"->>'displayName' AS sender_name, t."unipileThreadId"
       FROM "MessagingMessage" m JOIN "MessagingThread" t ON t."id" = m."messagingThreadId"
       WHERE m."unipileMessageId" = $1`,
      [unipileMessageId],
    );

    expect(message.rows).toHaveLength(1);
    expect(message.rows[0].unipileThreadId).toBe(counterpartChat);
    expect(message.rows[0].sender_name).toBe("Carla");
    expect(message.rows[0].bodyText).toBe("edited and misrouted");
    expect(message.rows[0].editedAt).not.toBeNull();
  });

  it("does not stamp the unrelated chat named by the misrouted update", async () => {
    const stray = await client.query(
      'SELECT "lastMessagePreview" FROM "MessagingThread" WHERE "unipileThreadId" = $1',
      [selfChat],
    );

    for (const row of stray.rows) expect(row.lastMessagePreview).toBeNull();
  });
});
