import { createTestRecordRecipientReader } from "@/tests/helpers/record-delivery";
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { PrismaRoutineEventAccess } from "../prisma-routine-event-access";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("routine event access against PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const readOwnRoleId = randomUUID();
  const readAllRoleId = randomUUID();
  const noAccessRoleId = randomUUID();
  const assignedOwnerId = randomUUID();
  const unassignedOwnerId = randomUUID();
  const readAllOwnerId = randomUUID();
  const noAccessOwnerId = randomUUID();
  const inactiveOwnerId = randomUUID();
  const crossCompanyOwnerId = randomUUID();

  const access = new PrismaRoutineEventAccess(createTestRecordRecipientReader());

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)`,
      [companyId, otherCompanyId],
    );
    for (const [id, company, name] of [
      [readOwnRoleId, companyId, "Routine read own"],
      [readAllRoleId, companyId, "Routine read all"],
      [noAccessRoleId, companyId, "Routine no access"],
    ] as const) {
      await client.query(
        `INSERT INTO "UserRole" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [id, name, company],
      );
    }
    for (const [roleId, resource, action] of [
      [readOwnRoleId, "inboxMessages", "readOwn"],
      [readAllRoleId, "inboxMessages", "readAll"],
    ] as const) {
      await client.query(
        `INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action")
         VALUES ($1, $2, $3, $4::"Resource", $5::"Action")`,
        [randomUUID(), roleId, companyId, resource, action],
      );
    }
    for (const [id, company, roleId, status] of [
      [assignedOwnerId, companyId, readOwnRoleId, "active"],
      [unassignedOwnerId, companyId, readOwnRoleId, "active"],
      [readAllOwnerId, companyId, readAllRoleId, "active"],
      [noAccessOwnerId, companyId, noAccessRoleId, "active"],
      [inactiveOwnerId, companyId, readAllRoleId, "inactive"],
      [crossCompanyOwnerId, otherCompanyId, null, "active"],
    ] as const) {
      await client.query(
        `INSERT INTO "User"
           ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "updatedAt")
         VALUES ($1, $2, 'Routine', 'Owner', $3, $4, $5::"Status", CURRENT_TIMESTAMP)`,
        [id, `${id}@example.invalid`, company, roleId, status],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE id = ANY($1)', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("fails closed for retired CRM event contracts", async () => {
    await expect(
      access.canUserAccessUnscoped({
        companyId,
        userId: assignedOwnerId,
        event: "contact.updated",
        entityId: randomUUID(),
        triggerPayload: {},
      }),
    ).resolves.toBe(false);
  });

  it("applies canonical inbox visibility to message and chat events", async () => {
    const ownedAccountId = randomUUID();
    const sharedAccountId = randomUUID();
    const unsyncedAccountId = randomUUID();
    const ownedThreadId = randomUUID();
    const sharedThreadId = randomUUID();
    const unsyncedThreadId = randomUUID();
    const visibleMessageId = randomUUID();
    const unselectedMessageId = randomUUID();
    const hiddenMessageId = randomUUID();
    const sharedMessageId = randomUUID();
    const unsyncedMessageId = randomUUID();
    const accountIds = [ownedAccountId, sharedAccountId, unsyncedAccountId];

    const messagingArgs = (
      event: string,
      entityId: string,
      connectedAccountId: string,
      threadId?: string,
      userId = assignedOwnerId,
    ) => ({
      companyId,
      userId,
      event,
      entityId,
      triggerPayload: {
        companyId,
        entityId,
        payload: {
          connectedAccountId,
          provider: "google",
          providerMessageId: `provider-${entityId}`,
          ...(threadId ? { threadId } : { providerThreadId: `provider-${entityId}` }),
        },
      },
    });

    try {
      for (const [id, ownerId, selectedFolderIds, foldersSynced] of [
        [ownedAccountId, assignedOwnerId, ["inbox"], true],
        [sharedAccountId, readAllOwnerId, ["inbox"], true],
        [unsyncedAccountId, assignedOwnerId, [], false],
      ] as const) {
        await client.query(
          `INSERT INTO "ConnectedAccount"
             ("id", "companyId", "userId", "unipileAccountId", "provider", "selectedFolderIds",
              "foldersSyncedAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'google', $5, $6, CURRENT_TIMESTAMP)`,
          [id, companyId, ownerId, `routine-${id}`, selectedFolderIds, foldersSynced ? new Date() : null],
        );
      }
      for (const [id, accountId, sharedToCrm] of [
        [ownedThreadId, ownedAccountId, false],
        [sharedThreadId, sharedAccountId, true],
        [unsyncedThreadId, unsyncedAccountId, false],
      ] as const) {
        await client.query(
          `INSERT INTO "MessagingThread"
             ("id", "companyId", "connectedAccountId", "unipileThreadId", "provider", "lastMessageAt",
              "sharedToCrm", "updatedAt")
           VALUES ($1, $2, $3, $4, 'google', CURRENT_TIMESTAMP, $5, CURRENT_TIMESTAMP)`,
          [id, companyId, accountId, `routine-${id}`, sharedToCrm],
        );
      }
      for (const [id, threadId, accountId, folderIds, isHidden] of [
        [visibleMessageId, ownedThreadId, ownedAccountId, ["inbox"], false],
        [unselectedMessageId, ownedThreadId, ownedAccountId, ["archive"], false],
        [hiddenMessageId, ownedThreadId, ownedAccountId, ["inbox"], true],
        [sharedMessageId, sharedThreadId, sharedAccountId, ["archive"], false],
        [unsyncedMessageId, unsyncedThreadId, unsyncedAccountId, ["archive"], false],
      ] as const) {
        await client.query(
          `INSERT INTO "MessagingMessage"
             ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider",
              "direction", "origin", "sender", "folderIds", "isHidden", "sentAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'google', 'inbound', 'unipile', '{}'::jsonb, $6, $7,
                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, companyId, threadId, accountId, `routine-${id}`, folderIds, isHidden],
        );
      }

      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.received", visibleMessageId, ownedAccountId, ownedThreadId),
        ),
      ).resolves.toBe(true);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.updated", unselectedMessageId, ownedAccountId, ownedThreadId),
        ),
      ).resolves.toBe(false);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.reaction", hiddenMessageId, ownedAccountId, ownedThreadId),
        ),
      ).resolves.toBe(false);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.received", visibleMessageId, sharedAccountId, ownedThreadId),
        ),
      ).resolves.toBe(false);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.received", visibleMessageId, ownedAccountId, sharedThreadId),
        ),
      ).resolves.toBe(false);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs(
            "messaging.message.received",
            visibleMessageId,
            ownedAccountId,
            ownedThreadId,
            unassignedOwnerId,
          ),
        ),
      ).resolves.toBe(false);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.received", unsyncedMessageId, unsyncedAccountId, unsyncedThreadId),
        ),
      ).resolves.toBe(true);

      await client.query(`UPDATE "MessagingMessage" SET "isDeleted" = true WHERE "id" = $1`, [visibleMessageId]);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.deleted", visibleMessageId, ownedAccountId, ownedThreadId),
        ),
      ).resolves.toBe(true);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.email.deleted", randomUUID(), ownedAccountId, ownedThreadId),
        ),
      ).resolves.toBe(false);

      await expect(
        access.canUserAccessUnscoped(messagingArgs("messaging.chat.updated", ownedThreadId, ownedAccountId)),
      ).resolves.toBe(true);
      await expect(
        access.canUserAccessUnscoped(messagingArgs("messaging.chat.updated", sharedThreadId, sharedAccountId)),
      ).resolves.toBe(false);

      await client.query(`UPDATE "MessagingMessage" SET "folderIds" = ARRAY['inbox'] WHERE "id" = $1`, [
        sharedMessageId,
      ]);
      await expect(
        access.canUserAccessUnscoped(
          messagingArgs("messaging.message.received", sharedMessageId, sharedAccountId, sharedThreadId),
        ),
      ).resolves.toBe(true);
      await expect(
        access.canUserAccessUnscoped(messagingArgs("messaging.chat.updated", sharedThreadId, sharedAccountId)),
      ).resolves.toBe(true);

      await client.query(`DELETE FROM "MessagingThread" WHERE "id" = $1`, [sharedThreadId]);
      await expect(
        access.canUserAccessUnscoped(messagingArgs("messaging.chat.deleted", sharedThreadId, sharedAccountId)),
      ).resolves.toBe(false);
    } finally {
      await client.query(`DELETE FROM "ConnectedAccount" WHERE "id" = ANY($1)`, [accountIds]);
    }
  });
});
