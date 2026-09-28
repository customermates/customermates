import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaMessagingRepo } from "../prisma-messaging.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("unread inbox count on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const accountId = randomUUID();
  const privateAccountId = randomUUID();
  const chatAccountId = randomUUID();
  const tenant = createMockUser({ id: userId, companyId });
  let visibleThreadId: string;

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" (id, "updatedAt") VALUES ($1, NOW())', [companyId]);
    for (const id of [userId, otherUserId]) {
      await client.query(
        'INSERT INTO "User" (id, email, "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())',
        [id, `${id}@example.invalid`, "Count", "Fixture", companyId],
      );
    }
    for (const [id, ownerId, provider] of [
      [accountId, userId, "mail"],
      [privateAccountId, otherUserId, "mail"],
      [chatAccountId, userId, "whatsapp"],
    ]) {
      await client.query(
        `INSERT INTO "ConnectedAccount" (id, "companyId", "userId", provider, "unipileAccountId", status,
          "selectedFolderIds", "foldersSyncedAt", "updatedAt") VALUES ($1,$2,$3,$4,$1,'ok',ARRAY['inbox'], $5,NOW())`,
        [id, companyId, ownerId, provider, provider === "mail" ? new Date() : null],
      );
    }
    visibleThreadId = await thread(accountId, ["inbox"]);
    await thread(accountId, ["archive"]);
    await thread(accountId, ["inbox"], { hidden: true });
    await thread(accountId, ["inbox"], { state: "open" });
    await thread(accountId, [], { empty: true });
    await thread(accountId, []);
    await thread(accountId, ["archive", "inbox"]);
    await thread(privateAccountId, ["inbox"]);
    await thread(privateAccountId, ["archive"], { shared: true });
    await thread(privateAccountId, ["inbox"], { shared: true });
    await thread(chatAccountId, []);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE id=$1', [companyId]);
    await client.end();
  });

  async function thread(
    account: string,
    folders: string[],
    options: {
      hidden?: boolean;
      state?: string;
      shared?: boolean;
      empty?: boolean;
    } = {},
  ) {
    const id = randomUUID();
    const provider = account === chatAccountId ? "whatsapp" : "mail";
    await client.query(
      `INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId",provider,type,"unipileThreadId",state,
        "sharedToCrm","lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,'single',$1,$5,$6,$7,NOW())`,
      [
        id,
        companyId,
        account,
        provider,
        options.state ?? "unread",
        options.shared ?? false,
        options.empty ? null : new Date(),
      ],
    );
    if (!options.empty) {
      await client.query(
        `INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",
        provider,direction,origin,sender,recipients,"folderIds","isHidden","sentAt","updatedAt")
        VALUES ($1,$2,$3,$4,$1,$5,'inbound','external','{}','{}',$6,$7,NOW(),NOW())`,
        [randomUUID(), companyId, id, account, provider, folders, options.hidden ?? false],
      );
    }
    return id;
  }

  const count = () => runWithTenant(tenant, () => new PrismaMessagingRepo().countUnreadThreadsForCurrentUser());

  it("counts visible unread conversations once, respecting private and individually shared accounts", async () => {
    expect(await count()).toBe(5);
    expect(
      await runWithTenant(createMockUser({ companyId: randomUUID() }), () =>
        new PrismaMessagingRepo().countUnreadThreadsForCurrentUser(),
      ),
    ).toBe(0);
  });

  it("recomputes after folder selection, moves and read-state changes", async () => {
    await client.query('UPDATE "ConnectedAccount" SET "selectedFolderIds"=ARRAY[]::text[] WHERE id=$1', [accountId]);
    expect(await count()).toBe(3);
    await client.query('UPDATE "ConnectedAccount" SET "selectedFolderIds"=ARRAY[\'inbox\'] WHERE id=$1', [accountId]);
    expect(await count()).toBe(5);
    await client.query('UPDATE "MessagingMessage" SET "folderIds"=ARRAY[\'archive\'] WHERE "messagingThreadId"=$1', [
      visibleThreadId,
    ]);
    expect(await count()).toBe(4);
    await client.query('UPDATE "MessagingMessage" SET "folderIds"=ARRAY[\'inbox\'] WHERE "messagingThreadId"=$1', [
      visibleThreadId,
    ]);
    await client.query("UPDATE \"MessagingThread\" SET state='open' WHERE id=$1", [visibleThreadId]);
    expect(await count()).toBe(4);
    await client.query("UPDATE \"MessagingThread\" SET state='unread' WHERE id=$1", [visibleThreadId]);
    expect(await count()).toBe(5);
  });
});
