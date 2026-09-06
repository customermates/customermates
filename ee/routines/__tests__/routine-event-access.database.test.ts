import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Filter } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { PrismaContactRepo } from "@/features/contacts/prisma-contact.repository";
import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaRoutineRepo } from "../prisma-routine.repository";
import { PrismaRoutineEventAccess } from "../routine-event-access";
import { PrismaRoutineFilterMatcher } from "../routine-filter-matcher";

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
  const assignedContactId = randomUUID();
  const unassignedContactId = randomUUID();
  const crossCompanyContactId = randomUUID();
  const deletedContactId = randomUUID();
  const organizationId = randomUUID();
  const customColumnId = randomUUID();
  const crossCompanyCustomColumnId = randomUUID();

  const access = new PrismaRoutineEventAccess(
    new PrismaRoutineFilterMatcher(new PrismaContactRepo(), {} as never, {} as never, {} as never, {} as never),
  );

  const argsFor = (userId: string, entityId = assignedContactId, filters: Filter[] = []) => ({
    companyId,
    userId,
    event: "contact.updated",
    entityId,
    triggerPayload: {
      companyId,
      userId: assignedOwnerId,
      entityId,
      payload: { contact: { id: entityId }, changes: { firstName: { previous: "A", current: "B" } } },
    },
    filters,
  });

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
      [readOwnRoleId, "contacts", "readOwn"],
      [readOwnRoleId, "inboxMessages", "readOwn"],
      [readAllRoleId, "contacts", "readAll"],
      [readAllRoleId, "inboxMessages", "readAll"],
      [readAllRoleId, "organizations", "readAll"],
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
    await client.query(
      `INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt")
       VALUES ($1, 'Assigned', 'Contact', $3, CURRENT_TIMESTAMP),
              ($2, 'Unassigned', 'Contact', $3, CURRENT_TIMESTAMP)`,
      [assignedContactId, unassignedContactId, companyId],
    );
    await client.query(
      `INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt")
       VALUES ($1, 'Cross-company', 'Contact', $2, CURRENT_TIMESTAMP)`,
      [crossCompanyContactId, otherCompanyId],
    );
    await client.query(
      `INSERT INTO "ContactUser" ("id", "contactId", "userId", "companyId", "updatedAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [randomUUID(), assignedContactId, assignedOwnerId, companyId],
    );
    await client.query(
      `INSERT INTO "Organization" ("id", "name", "companyId", "updatedAt")
       VALUES ($1, 'Northwind', $2, CURRENT_TIMESTAMP)`,
      [organizationId, companyId],
    );
    await client.query(
      `INSERT INTO "ContactOrganization" ("id", "contactId", "organizationId", "companyId", "updatedAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [randomUUID(), assignedContactId, organizationId, companyId],
    );
    await client.query(
      `INSERT INTO "CustomColumn" ("id", "label", "type", "entityType", "companyId", "updatedAt")
       VALUES ($1, 'Segment', 'plain', 'contact', $2, CURRENT_TIMESTAMP),
              ($3, 'Other workspace segment', 'plain', 'contact', $4, CURRENT_TIMESTAMP)`,
      [customColumnId, companyId, crossCompanyCustomColumnId, otherCompanyId],
    );
    await client.query(
      `INSERT INTO "CustomFieldValue"
         ("id", "entityType", "columnId", "value", "type", "companyId", "contactId", "updatedAt")
       VALUES ($1, 'contact', $2, 'Enterprise North', 'plain', $3, $4, CURRENT_TIMESTAMP)`,
      [randomUUID(), customColumnId, companyId, assignedContactId],
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM "RoutineRun" WHERE "companyId" = $1`, [companyId]);
    await client.query(`DELETE FROM "Routine" WHERE "companyId" = $1`, [companyId]);
    await client.query(`DELETE FROM "ContactUser" WHERE "companyId" = $1`, [companyId]);
    await client.query(`DELETE FROM "Contact" WHERE "companyId" = ANY($1)`, [[companyId, otherCompanyId]]);
    await client.query(`DELETE FROM "RolePermission" WHERE "companyId" = $1`, [companyId]);
    await client.query(`DELETE FROM "User" WHERE "companyId" = ANY($1)`, [[companyId, otherCompanyId]]);
    await client.query(`DELETE FROM "UserRole" WHERE "companyId" = $1`, [companyId]);
    await client.query(`DELETE FROM "Company" WHERE "id" = ANY($1)`, [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("applies read-own assignment even when a routine has no filters", async () => {
    await expect(access.matchesUserUnscoped(argsFor(assignedOwnerId))).resolves.toBe(true);
    await expect(access.matchesUserUnscoped(argsFor(unassignedOwnerId))).resolves.toBe(false);
    await expect(access.matchesUserUnscoped(argsFor(assignedOwnerId, unassignedContactId))).resolves.toBe(false);
  });

  it("keeps record access authoritative when an assignment filter matches", async () => {
    const filters: Filter[] = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: [assignedOwnerId] },
    ];

    await expect(access.matchesUserUnscoped(argsFor(assignedOwnerId, assignedContactId, filters))).resolves.toBe(true);
    await expect(access.matchesUserUnscoped(argsFor(readAllOwnerId, assignedContactId, filters))).resolves.toBe(true);
    await expect(access.matchesUserUnscoped(argsFor(unassignedOwnerId, assignedContactId, filters))).resolves.toBe(
      false,
    );
    await expect(
      access.matchesUserUnscoped(
        argsFor(readAllOwnerId, assignedContactId, [
          { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: [readAllOwnerId] },
        ]),
      ),
    ).resolves.toBe(false);
    await expect(
      access.matchesUserUnscoped(
        argsFor(assignedOwnerId, assignedContactId, [
          { field: FilterFieldKey.organizationIds, operator: FilterOperatorKey.in, value: [randomUUID()] },
        ]),
      ),
    ).resolves.toBe(false);
  });

  it("matches live relation and custom filters with explicit owner scope and fails closed on schema drift", async () => {
    const relationFilter: Filter[] = [
      { field: FilterFieldKey.organizationIds, operator: FilterOperatorKey.in, value: [organizationId] },
    ];
    const customFilter: Filter[] = [
      { field: customColumnId, operator: FilterOperatorKey.contains, value: "enterprise" },
    ];

    await expect(access.matchesUserUnscoped(argsFor(readAllOwnerId, assignedContactId, relationFilter))).resolves.toBe(
      true,
    );
    await expect(access.matchesUserUnscoped(argsFor(assignedOwnerId, assignedContactId, relationFilter))).resolves.toBe(
      false,
    );
    await expect(access.matchesUserUnscoped(argsFor(assignedOwnerId, assignedContactId, customFilter))).resolves.toBe(
      true,
    );
    await expect(
      access.matchesUserUnscoped(
        argsFor(assignedOwnerId, assignedContactId, [
          { field: crossCompanyCustomColumnId, operator: FilterOperatorKey.contains, value: "enterprise" },
        ]),
      ),
    ).resolves.toBe(false);

    await client.query(
      `UPDATE "CustomColumn" SET "type" = 'currency', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      [customColumnId],
    );
    try {
      await expect(access.matchesUserUnscoped(argsFor(assignedOwnerId, assignedContactId, customFilter))).resolves.toBe(
        false,
      );
    } finally {
      await client.query(
        `UPDATE "CustomColumn" SET "type" = 'plain', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        [customColumnId],
      );
    }
  });

  it("honors read-all, no-access, inactive, and cross-company boundaries", async () => {
    await expect(access.matchesUserUnscoped(argsFor(readAllOwnerId, unassignedContactId))).resolves.toBe(true);
    await expect(access.matchesUserUnscoped(argsFor(noAccessOwnerId))).resolves.toBe(false);
    await expect(access.matchesUserUnscoped(argsFor(inactiveOwnerId))).resolves.toBe(false);
    await expect(access.matchesUserUnscoped(argsFor(crossCompanyOwnerId))).resolves.toBe(false);
    await expect(access.matchesUserUnscoped(argsFor(readAllOwnerId, crossCompanyContactId))).resolves.toBe(false);
  });

  it("uses the deleted CRM snapshot and fails closed when its identity or assignment is missing", async () => {
    const deletedArgs = (
      userId: string,
      payload: Record<string, unknown>,
      filters: Filter[] = [],
      eventCompanyId: string | null = companyId,
    ) => ({
      companyId,
      userId,
      event: "contact.deleted",
      entityId: deletedContactId,
      triggerPayload:
        eventCompanyId === null
          ? { entityId: deletedContactId, payload }
          : { companyId: eventCompanyId, entityId: deletedContactId, payload },
      filters,
    });

    await expect(
      access.matchesUserUnscoped(
        deletedArgs(assignedOwnerId, { id: deletedContactId, users: [{ id: assignedOwnerId }] }),
      ),
    ).resolves.toBe(true);
    await expect(
      access.matchesUserUnscoped(deletedArgs(readAllOwnerId, { id: deletedContactId, users: [] })),
    ).resolves.toBe(true);
    await expect(
      access.matchesUserUnscoped(deletedArgs(noAccessOwnerId, { id: deletedContactId, users: [] })),
    ).resolves.toBe(false);
    await expect(
      access.matchesUserUnscoped(deletedArgs(readAllOwnerId, { id: unassignedContactId, users: [] })),
    ).resolves.toBe(false);
    await expect(
      access.matchesUserUnscoped(
        deletedArgs(readAllOwnerId, { id: deletedContactId, users: [] }, [
          { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: [assignedOwnerId] },
        ]),
      ),
    ).resolves.toBe(true);
    await expect(
      access.matchesUserUnscoped(deletedArgs(readAllOwnerId, { id: deletedContactId, users: [] }, [], otherCompanyId)),
    ).resolves.toBe(false);
    await expect(
      access.matchesUserUnscoped(deletedArgs(readAllOwnerId, { id: deletedContactId, users: [] }, [], null)),
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

  it("admits a real CRM event only for the routine owner who can read the record", async () => {
    const assignedRoutineId = randomUUID();
    const readAllRoutineId = randomUUID();
    const unassignedRoutineId = randomUUID();
    const noAccessRoutineId = randomUUID();
    const inactiveRoutineId = randomUUID();
    const crossCompanyRoutineId = randomUUID();
    for (const [id, ownerUserId] of [
      [assignedRoutineId, assignedOwnerId],
      [readAllRoutineId, readAllOwnerId],
      [unassignedRoutineId, unassignedOwnerId],
      [noAccessRoutineId, noAccessOwnerId],
      [inactiveRoutineId, inactiveOwnerId],
      [crossCompanyRoutineId, crossCompanyOwnerId],
    ] as const) {
      await client.query(
        `INSERT INTO "Routine"
           ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "triggerEvents",
            "changedFields", "triggerFilters", "debounceSeconds", "updatedAt")
         VALUES ($1, $2, $3, 'Contact watcher', 'Summarise this contact', 'event', ARRAY['contact.updated'],
                 ARRAY[]::text[], '[]'::jsonb, 0, CURRENT_TIMESTAMP)`,
        [id, companyId, ownerUserId],
      );
    }

    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const routineRepo = new PrismaRoutineRepo(access);
    const service = new EventService(
      [],
      { getWebhooksForEvent: vi.fn().mockResolvedValue([]) } as never,
      { create: vi.fn() } as never,
      { log: vi.fn().mockResolvedValue(undefined) } as never,
      background as never,
      routineRepo,
      access,
    );
    const publisher = createMockUser({ id: readAllOwnerId, companyId });

    const result = await runWithTenant(publisher, () =>
      service.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: assignedContactId,
        payload: {
          contact: { id: assignedContactId },
          changes: { firstName: { previous: "Before", current: "After" } },
        } as never,
      }),
    );

    expect(result.routineRuns).toBe(2);
    const runs = await client.query<{
      routineId: string;
      executedByUserId: string;
      status: string;
      triggerEntityId: string | null;
    }>(
      `SELECT "routineId", "executedByUserId", "status", "triggerEntityId" FROM "RoutineRun"
       WHERE "routineId" = ANY($1) ORDER BY "routineId"`,
      [
        [
          assignedRoutineId,
          readAllRoutineId,
          unassignedRoutineId,
          noAccessRoutineId,
          inactiveRoutineId,
          crossCompanyRoutineId,
        ],
      ],
    );
    expect(runs.rows).toHaveLength(2);
    expect(runs.rows).toEqual(
      expect.arrayContaining([
        {
          routineId: assignedRoutineId,
          executedByUserId: assignedOwnerId,
          status: "queued",
          triggerEntityId: assignedContactId,
        },
        {
          routineId: readAllRoutineId,
          executedByUserId: readAllOwnerId,
          status: "queued",
          triggerEntityId: assignedContactId,
        },
      ]),
    );
    expect(background.dispatch).toHaveBeenCalledTimes(2);
    expect(background.dispatch).toHaveBeenCalledWith(
      "run-routine",
      expect.objectContaining({ companyId, ownerUserId: assignedOwnerId }),
    );
    expect(background.dispatch).toHaveBeenCalledWith(
      "run-routine",
      expect.objectContaining({ companyId, ownerUserId: readAllOwnerId }),
    );
  });

  it("rechecks record access inside admission when assignment changes after candidate selection", async () => {
    const routineId = randomUUID();
    await client.query(
      `INSERT INTO "Routine"
         ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "triggerEvents",
          "changedFields", "triggerFilters", "debounceSeconds", "updatedAt")
       VALUES ($1, $2, $3, 'Assignment race', 'Summarise this contact', 'event', ARRAY['contact.updated'],
               ARRAY[]::text[], '[]'::jsonb, 0, CURRENT_TIMESTAMP)`,
      [routineId, companyId, assignedOwnerId],
    );
    const routineRepo = new PrismaRoutineRepo(access);
    const candidates = await routineRepo.findEventRoutinesUnscoped(companyId, "contact.updated");
    const candidate = candidates.find((routine) => routine.id === routineId);
    expect(candidate).toBeDefined();

    await client.query(`DELETE FROM "ContactUser" WHERE "contactId" = $1 AND "userId" = $2`, [
      assignedContactId,
      assignedOwnerId,
    ]);
    try {
      const admitted = await routineRepo.admitEventRoutineRunsUnscoped({
        companyId,
        event: "contact.updated",
        entityId: assignedContactId,
        triggerPayload: {
          companyId,
          entityId: assignedContactId,
          payload: {
            contact: { id: assignedContactId },
            changes: { notes: { previous: "Before", current: "After" } },
          },
        },
        routines: candidate ? [candidate] : [],
        now: new Date(),
      });

      expect(admitted).toEqual([]);
      const runs = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "RoutineRun" WHERE "routineId" = $1`,
        [routineId],
      );
      expect(runs.rows[0]).toEqual({ count: "0" });
    } finally {
      await client.query(
        `INSERT INTO "ContactUser" ("id", "contactId", "userId", "companyId", "updatedAt")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [randomUUID(), assignedContactId, assignedOwnerId, companyId],
      );
    }
  });
});
