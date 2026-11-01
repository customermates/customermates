import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";

import { PrismaConnectedAccountRepo } from "../prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "../prisma-unipile-webhook.repository";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("email folder pass across backfill steps on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  const threadId = randomUUID();
  const pass = { companyId, connectedAccountId: accountId, folderId: "INBOX" };
  const accounts = () =>
    new PrismaConnectedAccountRepo(
      new PermissionService(),
      new PrismaUnipileWebhookRepo(),
      new PrismaBillingUsageRepo(),
    );

  async function insertMessage(unipileMessageId: string, folderIds: string[]) {
    await client.query(
      `INSERT INTO "MessagingMessage"
        ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider", "direction",
         "origin", "sender", "recipients", "bodyText", "folderIds", "sentAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'mail', 'inbound', 'external', $6::jsonb, '{"to":[],"cc":[],"bcc":[]}'::jsonb,
         'synthetic', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        companyId,
        threadId,
        accountId,
        unipileMessageId,
        JSON.stringify({
          attendeeId: "sender@example.invalid",
          identifier: "sender@example.invalid",
          displayName: null,
        }),
        folderIds,
      ],
    );
  }

  async function placement(unipileMessageId: string) {
    const { rows } = await client.query<{ folderIds: string[]; isHidden: boolean }>(
      'SELECT "folderIds", "isHidden" FROM "MessagingMessage" WHERE "connectedAccountId" = $1 AND "unipileMessageId" = $2',
      [accountId, unipileMessageId],
    );
    return rows[0];
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `folder-pass-${userId}@example.invalid`, "Folder", "Pass", companyId],
    );
    await client.query(
      `INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt")
       VALUES ($1, $2, $3, 'mail', $4, 'ok', CURRENT_TIMESTAMP)`,
      [accountId, companyId, userId, `synthetic-folder-pass-${accountId}`],
    );
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "updatedAt") VALUES ($1, $2, $3, \'mail\', \'single\', $4, CURRENT_TIMESTAMP)',
      [threadId, companyId, accountId, `folder-pass-thread-${threadId}`],
    );
    await insertMessage("seen-first-step", ["INBOX"]);
    await insertMessage("seen-last-step", ["INBOX"]);
    await insertMessage("moved-to-archive", ["Archive", "INBOX", "Trash"]);
    await insertMessage("gone-everywhere", ["INBOX"]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("keeps the ids seen by earlier steps until the pass is cleared", async () => {
    await accounts().clearEmailFolderPassUnscoped(pass);
    await accounts().recordEmailFolderPassSeenUnscoped({ ...pass, unipileMessageIds: ["seen-first-step"] });
    await accounts().recordEmailFolderPassSeenUnscoped({ ...pass, unipileMessageIds: ["seen-first-step"] });
    await accounts().recordEmailFolderPassSeenUnscoped({ ...pass, folderId: "Archive", unipileMessageIds: ["x"] });

    expect(await accounts().listEmailFolderPassSeenUnscoped(pass)).toEqual(["seen-first-step"]);

    await accounts().clearEmailFolderPassUnscoped(pass);

    expect(await accounts().listEmailFolderPassSeenUnscoped(pass)).toEqual([]);
    expect(await accounts().listEmailFolderPassSeenUnscoped({ ...pass, folderId: "Archive" })).toEqual(["x"]);
  });

  it("removes only the placements the whole pass did not see, with a pass larger than one query can bind", async () => {
    const filler = Array.from({ length: 70_000 }, (_, index) => `elsewhere-${index}`);

    const removed = await createTestMessagingRepo().reconcileFolderMembershipUnscoped({
      ...pass,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      seenUnipileMessageIds: [...filler, "seen-first-step", "seen-last-step"],
    });

    expect(removed).toBe(2);
    expect(await placement("seen-first-step")).toEqual({ folderIds: ["INBOX"], isHidden: false });
    expect(await placement("seen-last-step")).toEqual({ folderIds: ["INBOX"], isHidden: false });
    expect(await placement("moved-to-archive")).toEqual({ folderIds: ["Archive", "Trash"], isHidden: false });
    expect(await placement("gone-everywhere")).toEqual({ folderIds: [], isHidden: true });
  });
});
