import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaConnectedAccountRepo } from "../prisma-connected-account.repository";
import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("shared-thread folder context on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const outsiderId = randomUUID();
  const accountId = randomUUID();
  const sharedThreadId = randomUUID();
  const privateThreadId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId });
  const colleague = createMockUser({ id: colleagueId, companyId });
  const outsider = createMockUser({ id: outsiderId, companyId: otherCompanyId });
  const folder = (id: string, name: string, role: string | null) => ({
    id,
    name,
    role,
    totalCount: null,
    unreadCount: null,
  });

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);
    for (const [id, tenantId] of [
      [ownerId, companyId],
      [colleagueId, companyId],
      [outsiderId, otherCompanyId],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `folders-${id}@example.invalid`, "Folder", "Test", tenantId],
      );
    }
    await client.query(
      `INSERT INTO "ConnectedAccount"
        ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "folders", "selectedFolderIds", "foldersSyncedAt", "updatedAt")
       VALUES ($1, $2, $3, 'mail', $4, 'ok', $5::jsonb, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        accountId,
        companyId,
        ownerId,
        `synthetic-folders-${accountId}`,
        JSON.stringify([
          folder("inbox", "Inbox", "INBOX"),
          folder("archive", "Archive", "ARCHIVE"),
          folder("private-label", "Board 2027", null),
          folder("hidden", "Hidden", null),
        ]),
        ["inbox", "archive", "private-label"],
      ],
    );
    for (const [id, shared] of [
      [sharedThreadId, true],
      [privateThreadId, false],
    ] as const) {
      await client.query(
        'INSERT INTO "MessagingThread" ("id", "companyId", "connectedAccountId", "provider", "type", "unipileThreadId", "sharedToCrm", "updatedAt") VALUES ($1, $2, $3, \'mail\', \'single\', $4, $5, CURRENT_TIMESTAMP)',
        [id, companyId, accountId, `folders-thread-${id}`, shared],
      );
    }
    await client.query(
      `INSERT INTO "MessagingMessage"
        ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider", "direction",
         "origin", "sender", "recipients", "bodyText", "folderIds", "sentAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'mail', 'inbound', 'external', $6::jsonb, '{"to":[],"cc":[],"bcc":[]}'::jsonb,
         'synthetic', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        companyId,
        sharedThreadId,
        accountId,
        `folders-message-${sharedThreadId}`,
        JSON.stringify({
          attendeeId: "sender@example.invalid",
          identifier: "sender@example.invalid",
          displayName: null,
        }),
        ["archive", "hidden"],
      ],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1::text[])', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("names only the visible folders the shared conversation sits in", async () => {
    const context = await runWithTenant(colleague, () =>
      new PrismaConnectedAccountRepo().findSharedThreadFolderContext(sharedThreadId, ["archive", "hidden"]),
    );

    expect(context).toEqual({ folders: [folder("archive", "Archive", "ARCHIVE")], selectedFolderIds: ["archive"] });
  });

  it("shows a shared reader only the visible folders of each message", async () => {
    const [shared, own] = await Promise.all([
      runWithTenant(colleague, () => new PrismaMessagingRepo().listMessagesForThread(sharedThreadId)),
      runWithTenant(owner, () => new PrismaMessagingRepo().listMessagesForThread(sharedThreadId)),
    ]);

    expect(shared.messages.map((message) => message.folderIds)).toEqual([["archive"]]);
    expect(own.messages.map((message) => message.folderIds)).toEqual([["archive", "hidden"]]);
  });

  it("keeps the whole-account catalog private from a colleague", async () => {
    expect(
      await runWithTenant(colleague, () => new PrismaConnectedAccountRepo().findFolderContextById(accountId)),
    ).toBeNull();
  });

  it("reveals nothing for a conversation that is not shared", async () => {
    expect(
      await runWithTenant(colleague, () =>
        new PrismaConnectedAccountRepo().findSharedThreadFolderContext(privateThreadId, ["inbox"]),
      ),
    ).toBeNull();
  });

  it("reveals nothing across workspaces", async () => {
    expect(
      await runWithTenant(outsider, () =>
        new PrismaConnectedAccountRepo().findSharedThreadFolderContext(sharedThreadId, ["inbox"]),
      ),
    ).toBeNull();
  });
});
