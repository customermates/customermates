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

describeDatabase("draft discard access on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const accountId = randomUUID();
  const threadId = randomUUID();
  const chatAccountId = randomUUID();
  const chatThreadId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId });
  const colleague = createMockUser({ id: colleagueId, companyId });
  const revision = new Date("2026-10-04T08:00:00.000Z");
  const sender = {
    attendeeId: "owner@example.invalid",
    identifier: "owner@example.invalid",
    displayName: null,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf: true,
  };

  async function insertDraft() {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "MessagingMessage"
        ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider", "direction",
         "origin", "sender", "recipients", "bodyText", "isDraft", "sentAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'google', 'outbound', 'external', $6::jsonb, '{"to":[],"cc":[],"bcc":[]}'::jsonb,
         'synthetic draft', TRUE, $7, $7)`,
      [id, companyId, threadId, accountId, `draft-${id}`, JSON.stringify(sender), revision],
    );
    return id;
  }

  async function draftExists(id: string) {
    const result = await client.query('SELECT 1 FROM "MessagingMessage" WHERE "id" = $1', [id]);
    return result.rowCount === 1;
  }

  async function setAccountShared(shared: boolean) {
    await client.query('UPDATE "ConnectedAccount" SET "shared" = $2 WHERE "id" = $1', [accountId, shared]);
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    for (const id of [ownerId, colleagueId]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `discard-${id}@example.invalid`, "Discard", "Test", companyId],
      );
    }
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt") VALUES ($1, $2, $3, \'google\', $4, \'ok\', CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, `synthetic-discard-${accountId}`],
    );
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "sharedToCrm", "updatedAt") VALUES ($1, $2, $3, \'google\', \'single\', $4, TRUE, CURRENT_TIMESTAMP)',
      [threadId, companyId, accountId, `discard-thread-${threadId}`],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "updatedAt") VALUES ($1, $2, $3, \'linkedin\', $4, \'ok\', CURRENT_TIMESTAMP)',
      [chatAccountId, companyId, ownerId, `synthetic-chat-${chatAccountId}`],
    );
    await client.query(
      'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "sharedToCrm", "updatedAt") VALUES ($1, $2, $3, \'linkedin\', \'single\', $4, TRUE, CURRENT_TIMESTAMP)',
      [chatThreadId, companyId, chatAccountId, `chat-thread-${chatThreadId}`],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("keeps the owner's draft when a teammate only reads the shared conversation", async () => {
    await setAccountShared(false);
    const draftId = await insertDraft();

    const result = await runWithTenant(colleague, () =>
      new PrismaMessagingRepo().deleteDraft({ messageId: draftId, expectedUpdatedAt: revision }),
    );

    expect(result).toEqual({ status: "not_found" });
    expect(await draftExists(draftId)).toBe(true);
  });

  it("lets a teammate with access to the whole account discard it", async () => {
    await setAccountShared(true);
    const draftId = await insertDraft();

    const result = await runWithTenant(colleague, () =>
      new PrismaMessagingRepo().deleteDraft({ messageId: draftId, expectedUpdatedAt: revision }),
    );

    expect(result).toMatchObject({ status: "deleted", messagingThreadId: threadId });
    expect(await draftExists(draftId)).toBe(false);
  });

  it("still clears the draft after a whole-account teammate sends it", async () => {
    await setAccountShared(true);
    const draftId = await insertDraft();

    await runWithTenant(colleague, () =>
      new PrismaMessagingRepo().discardDraftAfterSend({ messageId: draftId, expectedUpdatedAt: revision }),
    );

    expect(await draftExists(draftId)).toBe(false);
  });

  it("refuses to overwrite the owner's chat draft for a teammate who only reads the shared conversation", async () => {
    const save = (user: typeof owner, bodyText: string) =>
      runWithTenant(user, () =>
        new PrismaMessagingRepo().upsertThreadDraftOrThrow({
          threadId: chatThreadId,
          connectedAccountId: chatAccountId,
          provider: MessagingProvider.linkedin,
          sender: { ...sender, identifier: "owner-handle", attendeeId: "owner-handle", contact: null },
          subject: null,
          bodyText,
          recipients: { to: [], cc: [], bcc: [] },
        }),
      );
    await save(owner, "owner draft");

    await expect(save(colleague, "teammate overwrite")).rejects.toThrow();

    const rows = await client.query(
      'SELECT "bodyText" FROM "MessagingMessage" WHERE "messagingThreadId" = $1 AND "isDraft"',
      [chatThreadId],
    );
    expect(rows.rows.map((row) => row.bodyText)).toEqual(["owner draft"]);
  });

  it("lets the account owner discard it", async () => {
    await setAccountShared(false);
    const draftId = await insertDraft();

    const result = await runWithTenant(owner, () =>
      new PrismaMessagingRepo().deleteDraft({ messageId: draftId, expectedUpdatedAt: revision }),
    );

    expect(result).toMatchObject({ status: "deleted" });
    expect(await draftExists(draftId)).toBe(false);
  });
});
