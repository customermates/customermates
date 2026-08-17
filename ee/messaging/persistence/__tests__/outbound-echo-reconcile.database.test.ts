import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("outbound chat echo reconciliation under tenant bypass", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const accountId = randomUUID();
  const ownerId = randomUUID();
  const threadId = randomUUID();
  const localMessageId = randomUUID();
  const sentAt = new Date("2026-01-01T12:00:00.000Z");
  const bodyText = "echo reconciliation subject";
  const providerMessageId = `provider-${randomUUID()}`;

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, `echo-${ownerId}@example.com`, "Echo", "Owner", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, "whatsapp", `unipile-${accountId}`, "ok"],
    );
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [threadId, companyId, accountId, "whatsapp", "single", `thread-${threadId}`],
    );
    await client.query(
      `INSERT INTO "MessagingMessage" ("id", "companyId", "messagingThreadId", "connectedAccountId", "provider", "direction", "origin", "unipileMessageId", "bodyText", "sender", "recipients", "isDraft", "sentAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb, '{}'::jsonb, false, $10, CURRENT_TIMESTAMP)`,
      [
        localMessageId,
        companyId,
        threadId,
        accountId,
        "whatsapp",
        "outbound",
        "unipile",
        `sent_${localMessageId}`,
        bodyText,
        sentAt,
      ],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "MessagingMessage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "MessagingThread" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "ConnectedAccount" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("reconciles the provider echo onto the locally sent row without reading tenant context", async () => {
    const repo = new PrismaMessagingRepo() as unknown as {
      reconcileOutboundChatEcho(args: {
        messagingThreadId: string;
        connectedAccountId: string;
        unipileMessageId: string;
        bodyText: string | null;
        sentAt: Date;
      }): Promise<boolean>;
    };

    const { prisma } = await import("@/prisma/db");
    const storedSentAt = await runWithoutTenant(async () => {
      const row = await prisma.messagingMessage.findUniqueOrThrow({
        where: { id: localMessageId },
        select: { sentAt: true },
      });
      return row.sentAt;
    });

    const reconciled = await runWithoutTenant(() =>
      repo.reconcileOutboundChatEcho({
        messagingThreadId: threadId,
        connectedAccountId: accountId,
        unipileMessageId: providerMessageId,
        bodyText,
        sentAt: storedSentAt,
      }),
    );

    expect(reconciled).toBe(true);

    const row = await client.query('SELECT "unipileMessageId" FROM "MessagingMessage" WHERE "id" = $1', [
      localMessageId,
    ]);
    expect(row.rows[0].unipileMessageId).toBe(providerMessageId);
  });
});
