import type { Filter } from "@/core/base/base-get.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, EntityType, Resource } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { DomainEvent } from "@/features/event/domain-events";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { PrismaActivitiesRepo } from "../prisma-activities.repository";

function relationshipFilter(
  field:
    | FilterFieldKey.contactIds
    | FilterFieldKey.organizationIds
    | FilterFieldKey.dealIds
    | FilterFieldKey.serviceIds
    | FilterFieldKey.taskIds,
  operator: FilterOperatorKey.in | FilterOperatorKey.notIn | FilterOperatorKey.hasSome | FilterOperatorKey.hasNone,
  value?: string[],
): Filter {
  return {
    field,
    operator,
    ...(value ? { value } : {}),
  } as Filter;
}

const auditOnlyFilter = {
  field: FilterFieldKey.timelineKind,
  operator: FilterOperatorKey.in,
  value: ["changes"],
} as Filter;

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("activity relationship filters on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const crossTenantCompanyId = randomUUID();
  const userId = randomUUID();
  const crossTenantContactId = randomUUID();
  const selectedContactId = randomUUID();
  const otherContactId = randomUUID();
  const selectedOrganizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const selectedDealId = randomUUID();
  const otherDealId = randomUUID();
  const selectedServiceId = randomUUID();
  const otherServiceId = randomUUID();
  const selectedTaskId = randomUUID();
  const otherTaskId = randomUUID();
  const linkedinAccountId = randomUUID();
  const googleAccountId = randomUUID();
  const calendarId = randomUUID();
  const selectedMessageId = randomUUID();
  const otherMessageId = randomUUID();
  const unlinkedMessageId = randomUUID();
  const selectedActivityId = randomUUID();
  const otherActivityId = randomUUID();
  const unlinkedActivityId = randomUUID();
  const selectedCalendarEventId = randomUUID();
  const otherCalendarEventId = randomUUID();
  const unlinkedCalendarEventId = randomUUID();
  const selectedAuditId = randomUUID();
  const otherAuditId = randomUUID();
  const selectedOrganizationAuditId = randomUUID();
  const otherOrganizationAuditId = randomUUID();
  const selectedDealAuditId = randomUUID();
  const otherDealAuditId = randomUUID();
  const selectedServiceAuditId = randomUUID();
  const otherServiceAuditId = randomUUID();
  const selectedTaskAuditId = randomUUID();
  const otherTaskAuditId = randomUUID();
  const unlinkedAuditId = randomUUID();
  const senderMatchedThreadId = randomUUID();

  const relationshipCases = [
    {
      field: FilterFieldKey.contactIds,
      selectedId: selectedContactId,
      otherId: otherContactId,
      selectedAuditId,
      otherAuditId,
    },
    {
      field: FilterFieldKey.organizationIds,
      selectedId: selectedOrganizationId,
      otherId: otherOrganizationId,
      selectedAuditId: selectedOrganizationAuditId,
      otherAuditId: otherOrganizationAuditId,
    },
    {
      field: FilterFieldKey.dealIds,
      selectedId: selectedDealId,
      otherId: otherDealId,
      selectedAuditId: selectedDealAuditId,
      otherAuditId: otherDealAuditId,
    },
    {
      field: FilterFieldKey.serviceIds,
      selectedId: selectedServiceId,
      otherId: otherServiceId,
      selectedAuditId: selectedServiceAuditId,
      otherAuditId: otherServiceAuditId,
    },
    {
      field: FilterFieldKey.taskIds,
      selectedId: selectedTaskId,
      otherId: otherTaskId,
      selectedAuditId: selectedTaskAuditId,
      otherAuditId: otherTaskAuditId,
    },
  ] as const;

  const tenant = {
    ...createMockUserWithPermissions([
      { resource: Resource.auditLog, action: Action.readAll },
      { resource: Resource.contacts, action: Action.readAll },
      { resource: Resource.organizations, action: Action.readAll },
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.services, action: Action.readAll },
      { resource: Resource.tasks, action: Action.readAll },
      { resource: Resource.inboxMessages, action: Action.readAll },
    ]),
    id: userId,
    companyId,
    email: `${userId}@example.invalid`,
  } satisfies TenantUser;

  const readOwnTenant = {
    ...createMockUserWithPermissions([
      { resource: Resource.auditLog, action: Action.readAll },
      { resource: Resource.contacts, action: Action.readOwn },
      { resource: Resource.organizations, action: Action.readOwn },
      { resource: Resource.deals, action: Action.readOwn },
      { resource: Resource.services, action: Action.readOwn },
      { resource: Resource.tasks, action: Action.readOwn },
    ]),
    id: userId,
    companyId,
    email: `${userId}@example.invalid`,
  } satisfies TenantUser;

  const makeRepo = () => {
    const repo = new PrismaActivitiesRepo();
    repo.setMessagingSourcesEnabled(true);
    return repo;
  };

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, crossTenantCompanyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, tenant.email, "Activity", "Reader", companyId],
    );
    await client.query(
      'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $5, CURRENT_TIMESTAMP), ($4, $2, $3, $5, CURRENT_TIMESTAMP)',
      [selectedContactId, "Selected", "Contact", otherContactId, companyId],
    );
    await client.query(
      'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [crossTenantContactId, "Cross-tenant", "Contact", crossTenantCompanyId],
    );
    await client.query(
      'INSERT INTO "Organization" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $5, CURRENT_TIMESTAMP), ($3, $4, $5, CURRENT_TIMESTAMP)',
      [selectedOrganizationId, "Selected organization", otherOrganizationId, "Other organization", companyId],
    );
    await client.query(
      'INSERT INTO "ContactOrganization" ("id", "contactId", "organizationId", "companyId", "updatedAt") VALUES ($1, $2, $3, $7, CURRENT_TIMESTAMP), ($4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [
        randomUUID(),
        selectedContactId,
        selectedOrganizationId,
        randomUUID(),
        otherContactId,
        otherOrganizationId,
        companyId,
      ],
    );
    await client.query(
      'INSERT INTO "Deal" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $5, CURRENT_TIMESTAMP), ($3, $4, $5, CURRENT_TIMESTAMP)',
      [selectedDealId, "Selected deal", otherDealId, "Other deal", companyId],
    );
    await client.query(
      'INSERT INTO "DealContact" ("id", "dealId", "contactId", "companyId", "updatedAt") VALUES ($1, $2, $3, $7, CURRENT_TIMESTAMP), ($4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedDealId, selectedContactId, randomUUID(), otherDealId, otherContactId, companyId],
    );
    await client.query(
      'INSERT INTO "Service" ("id", "name", "amount", "companyId", "updatedAt") VALUES ($1, $2, 100, $5, CURRENT_TIMESTAMP), ($3, $4, 200, $5, CURRENT_TIMESTAMP)',
      [selectedServiceId, "Selected service", otherServiceId, "Other service", companyId],
    );
    await client.query(
      'INSERT INTO "ServiceDeal" ("id", "serviceId", "dealId", "companyId", "updatedAt") VALUES ($1, $2, $3, $7, CURRENT_TIMESTAMP), ($4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedServiceId, selectedDealId, randomUUID(), otherServiceId, otherDealId, companyId],
    );
    await client.query(
      'INSERT INTO "Task" ("id", "type", "name", "companyId", "updatedAt") VALUES ($1, \'custom\', $2, $5, CURRENT_TIMESTAMP), ($3, \'custom\', $4, $5, CURRENT_TIMESTAMP)',
      [selectedTaskId, "Selected task", otherTaskId, "Other task", companyId],
    );
    await client.query(
      'INSERT INTO "TaskContact" ("id", "taskId", "contactId", "companyId", "updatedAt") VALUES ($1, $2, $3, $7, CURRENT_TIMESTAMP), ($4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedTaskId, selectedContactId, randomUUID(), otherTaskId, otherContactId, companyId],
    );
    await client.query(
      'INSERT INTO "ContactUser" ("id", "contactId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedContactId, userId, companyId],
    );
    await client.query(
      'INSERT INTO "OrganizationUser" ("id", "organizationId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedOrganizationId, userId, companyId],
    );
    await client.query(
      'INSERT INTO "DealUser" ("id", "dealId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedDealId, userId, companyId],
    );
    await client.query(
      'INSERT INTO "ServiceUser" ("id", "serviceId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedServiceId, userId, companyId],
    );
    await client.query(
      'INSERT INTO "TaskUser" ("id", "taskId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), selectedTaskId, userId, companyId],
    );
    await client.query(
      `INSERT INTO "ContactIdentifier"
        ("id", "companyId", "contactId", "provider", "channelClass", "value", "messagingId", "updatedAt")
       VALUES
        ($1, $9, $2, 'linkedin', 'linkedin', $3, $4, CURRENT_TIMESTAMP),
        ($5, $9, $2, 'google', 'email', $6, NULL, CURRENT_TIMESTAMP),
        ($7, $9, $8, 'linkedin', 'linkedin', $10, $11, CURRENT_TIMESTAMP),
        ($12, $9, $8, 'google', 'email', $13, NULL, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        selectedContactId,
        "selected-linkedin",
        "selected-provider-user",
        randomUUID(),
        "selected@example.invalid",
        randomUUID(),
        otherContactId,
        companyId,
        "other-linkedin",
        "other-provider-user",
        randomUUID(),
        "other@example.invalid",
      ],
    );
    await client.query(
      `INSERT INTO "ConnectedAccount"
        ("id", "companyId", "userId", "unipileAccountId", "provider", "status", "hasMessaging", "hasCalendar", "updatedAt")
       VALUES
        ($1, $3, $4, $5, 'linkedin', 'ok', TRUE, FALSE, CURRENT_TIMESTAMP),
        ($2, $3, $4, $6, 'google', 'ok', TRUE, TRUE, CURRENT_TIMESTAMP)`,
      [linkedinAccountId, googleAccountId, companyId, userId, `li-${linkedinAccountId}`, `g-${googleAccountId}`],
    );

    const threadFixtures = [
      {
        threadId: senderMatchedThreadId,
        messageId: selectedMessageId,
        participantId: "sender-only-provider-user",
        senderIdentifier: "selected-linkedin",
        sentAt: "2026-01-04T12:00:00.000Z",
      },
      {
        threadId: randomUUID(),
        messageId: otherMessageId,
        participantId: "other-provider-user",
        senderIdentifier: "other-linkedin",
        sentAt: "2026-01-03T12:00:00.000Z",
      },
      {
        threadId: randomUUID(),
        messageId: unlinkedMessageId,
        participantId: "unlinked-provider-user",
        senderIdentifier: null,
        sentAt: "2026-01-02T12:00:00.000Z",
      },
    ];

    for (const fixture of threadFixtures) {
      await client.query(
        `INSERT INTO "MessagingThread"
          ("id", "companyId", "connectedAccountId", "unipileThreadId", "provider", "lastMessageAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'linkedin', $5, CURRENT_TIMESTAMP)`,
        [fixture.threadId, companyId, linkedinAccountId, `thread-${fixture.threadId}`, fixture.sentAt],
      );
      await client.query(
        `INSERT INTO "MessagingThreadParticipant"
          ("id", "companyId", "messagingThreadId", "provider", "providerUserId", "displayName", "updatedAt")
         VALUES ($1, $2, $3, 'linkedin', $4, $5, CURRENT_TIMESTAMP)`,
        [randomUUID(), companyId, fixture.threadId, fixture.participantId, fixture.participantId],
      );
      await client.query(
        `INSERT INTO "MessagingMessage"
          ("id", "companyId", "messagingThreadId", "connectedAccountId", "unipileMessageId", "provider", "direction", "origin", "sender", "recipients", "senderIdentifier", "sentAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'linkedin', 'inbound', 'unipile', $8::jsonb, $9::jsonb, $6, $7, CURRENT_TIMESTAMP)`,
        [
          fixture.messageId,
          companyId,
          fixture.threadId,
          linkedinAccountId,
          `message-${fixture.messageId}`,
          fixture.senderIdentifier,
          fixture.sentAt,
          JSON.stringify({
            attendeeId: fixture.participantId,
            displayName: fixture.participantId,
            identifier: fixture.senderIdentifier ?? fixture.participantId,
            isSelf: false,
          }),
          JSON.stringify({ to: [], cc: [], bcc: [] }),
        ],
      );
    }

    await client.query(
      `INSERT INTO "AccountActivity"
        ("id", "companyId", "connectedAccountId", "identifier", "kind", "payload", "occurredAt")
       VALUES
        ($1, $7, $8, $2, 'linkedin_connection_accepted', '{}'::jsonb, '2026-01-07T12:00:00.000Z'),
        ($3, $7, $8, $4, 'linkedin_connection_accepted', '{}'::jsonb, '2026-01-06T12:00:00.000Z'),
        ($5, $7, $8, $6, 'linkedin_connection_accepted', '{}'::jsonb, '2026-01-05T12:00:00.000Z')`,
      [
        selectedActivityId,
        "selected-linkedin",
        otherActivityId,
        "other-linkedin",
        unlinkedActivityId,
        null,
        companyId,
        linkedinAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "Calendar"
        ("id", "companyId", "connectedAccountId", "unipileCalendarId", "name", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Fixture calendar', CURRENT_TIMESTAMP)`,
      [calendarId, companyId, googleAccountId, `calendar-${calendarId}`],
    );
    await client.query(
      `INSERT INTO "CalendarEvent"
        ("id", "companyId", "connectedAccountId", "calendarId", "unipileEventId", "title", "startsAt", "endsAt", "attendees", "attendeeEmails", "updatedAt")
       VALUES
        ($1, $10, $11, $12, $2, 'Selected meeting', '2026-01-10T12:00:00.000Z', '2026-01-10T13:00:00.000Z', '[]'::jsonb, $3, CURRENT_TIMESTAMP),
        ($4, $10, $11, $12, $5, 'Other meeting', '2026-01-09T12:00:00.000Z', '2026-01-09T13:00:00.000Z', '[]'::jsonb, $6, CURRENT_TIMESTAMP),
        ($7, $10, $11, $12, $8, 'Unlinked meeting', '2026-01-08T12:00:00.000Z', '2026-01-08T13:00:00.000Z', '[]'::jsonb, $9, CURRENT_TIMESTAMP)`,
      [
        selectedCalendarEventId,
        `event-${selectedCalendarEventId}`,
        ["selected@example.invalid"],
        otherCalendarEventId,
        `event-${otherCalendarEventId}`,
        ["other@example.invalid"],
        unlinkedCalendarEventId,
        `event-${unlinkedCalendarEventId}`,
        [],
        companyId,
        googleAccountId,
        calendarId,
      ],
    );
    const auditFixtures = [
      [selectedAuditId, DomainEvent.CONTACT_UPDATED, selectedContactId],
      [otherAuditId, DomainEvent.CONTACT_UPDATED, otherContactId],
      [selectedOrganizationAuditId, DomainEvent.ORGANIZATION_UPDATED, selectedOrganizationId],
      [otherOrganizationAuditId, DomainEvent.ORGANIZATION_UPDATED, otherOrganizationId],
      [selectedDealAuditId, DomainEvent.DEAL_UPDATED, selectedDealId],
      [otherDealAuditId, DomainEvent.DEAL_UPDATED, otherDealId],
      [selectedServiceAuditId, DomainEvent.SERVICE_UPDATED, selectedServiceId],
      [otherServiceAuditId, DomainEvent.SERVICE_UPDATED, otherServiceId],
      [selectedTaskAuditId, DomainEvent.TASK_UPDATED, selectedTaskId],
      [otherTaskAuditId, DomainEvent.TASK_UPDATED, otherTaskId],
      [unlinkedAuditId, DomainEvent.COMPANY_UPDATED, companyId],
    ] as const;

    for (const [index, [id, event, entityId]] of auditFixtures.entries()) {
      await client.query(
        `INSERT INTO "AuditLog"
          ("id", "event", "eventData", "companyId", "userId", "entityId", "createdAt")
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
        [
          id,
          event,
          JSON.stringify({ payload: { changes: {} } }),
          companyId,
          userId,
          entityId,
          new Date(Date.UTC(2026, 0, 21 - index, 12)),
        ],
      );
    }
  }, 30_000);

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" IN ($1, $2)', [companyId, crossTenantCompanyId]);
    await client.end();
  });

  it("resolves selected relationship labels in one permission-scoped batch and omits stale IDs", async () => {
    const staleId = randomUUID();
    const repo = makeRepo();

    const options = await runWithTenant(tenant, () =>
      repo.listRecordOptions({
        records: [
          { entityType: EntityType.contact, ids: [selectedContactId, staleId] },
          {
            entityType: EntityType.organization,
            ids: [selectedOrganizationId],
          },
          { entityType: EntityType.deal, ids: [selectedDealId] },
          { entityType: EntityType.service, ids: [selectedServiceId] },
          { entityType: EntityType.task, ids: [selectedTaskId] },
        ],
      }),
    );

    expect(options).toEqual([
      {
        entityType: EntityType.contact,
        id: selectedContactId,
        label: "Selected Contact",
        avatarUrl: null,
      },
      {
        entityType: EntityType.organization,
        id: selectedOrganizationId,
        label: "Selected organization",
        avatarUrl: null,
      },
      {
        entityType: EntityType.deal,
        id: selectedDealId,
        label: "Selected deal",
        avatarUrl: null,
      },
      {
        entityType: EntityType.service,
        id: selectedServiceId,
        label: "Selected service",
        avatarUrl: null,
      },
      {
        entityType: EntityType.task,
        id: selectedTaskId,
        label: "Selected task",
        avatarUrl: null,
      },
    ]);
    expect(options.some(({ id }) => id === staleId)).toBe(false);
  });

  it("includes a conversation when the runtime sender identifier matches without a participant match", async () => {
    const repo = makeRepo();

    const options = await runWithTenant(tenant, () =>
      repo.listThreadOptions({
        filters: [relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.in, [selectedContactId])] as never,
      }),
    );

    expect(options.map(({ id }) => id)).toContain(senderMatchedThreadId);
  });

  it.each(
    relationshipCases.flatMap((relationship) => [
      { ...relationship, operator: FilterOperatorKey.hasSome, expectedCount: 1 } as const,
      { ...relationship, operator: FilterOperatorKey.hasNone, expectedCount: 9 } as const,
    ]),
  )(
    "limits direct audit rows to owned records for $field $operator",
    async ({ field, operator, selectedAuditId: selectedFieldAuditId, otherAuditId, expectedCount }) => {
      const repo = makeRepo();
      const filters = [relationshipFilter(field, operator), auditOnlyFilter];

      const [items, count] = await runWithTenant(readOwnTenant, () =>
        Promise.all([repo.getItems({ filters, take: 100 }), repo.getCount({ filters })]),
      );
      const ids = new Set(items.map(({ id }) => id));

      expect(items).toHaveLength(expectedCount);
      expect(count).toBe(expectedCount);
      expect(ids.has(selectedFieldAuditId)).toBe(operator === FilterOperatorKey.hasSome);
      expect(ids.has(otherAuditId)).toBe(false);
    },
  );

  it.each([FilterOperatorKey.in, FilterOperatorKey.notIn] as const)(
    "fails closed for an explicit cross-tenant record with %s",
    async (operator) => {
      const repo = makeRepo();
      const filters = [
        relationshipFilter(FilterFieldKey.contactIds, operator, [crossTenantContactId]),
        auditOnlyFilter,
      ];

      const [items, count] = await runWithTenant(tenant, () =>
        Promise.all([repo.getItems({ filters, take: 100 }), repo.getCount({ filters })]),
      );

      expect(items).toEqual([]);
      expect(count).toBe(0);
    },
  );

  it.each(
    relationshipCases.flatMap((relationship) => [
      {
        ...relationship,
        operator: FilterOperatorKey.in,
        expectedCount: 4,
      } as const,
      {
        ...relationship,
        operator: FilterOperatorKey.notIn,
        expectedCount: 16,
      } as const,
      {
        ...relationship,
        operator: FilterOperatorKey.hasSome,
        expectedCount: 8,
      } as const,
      {
        ...relationship,
        operator: FilterOperatorKey.hasNone,
        expectedCount: 12,
      } as const,
    ]),
  )(
    "applies $field $operator with null-safe linked/unlinked semantics",
    async ({ field, operator, selectedId, selectedAuditId: selectedFieldAuditId, otherAuditId, expectedCount }) => {
      const value =
        operator === FilterOperatorKey.in || operator === FilterOperatorKey.notIn ? [selectedId] : undefined;
      const filter = relationshipFilter(field, operator, value);
      const repo = makeRepo();

      const [items, count] = await runWithTenant(tenant, () =>
        Promise.all([repo.getItems({ filters: [filter], take: 100 }), repo.getCount({ filters: [filter] })]),
      );
      const itemIds = new Set(items.map((item) => item.id));
      const selectedLinkedIds = [selectedFieldAuditId, selectedMessageId, selectedActivityId, selectedCalendarEventId];
      const otherLinkedIds = [otherAuditId, otherMessageId, otherActivityId, otherCalendarEventId];
      const unlinkedIds = [unlinkedAuditId, unlinkedMessageId, unlinkedActivityId, unlinkedCalendarEventId];

      expect(items).toHaveLength(expectedCount);
      expect(count).toBe(expectedCount);
      if (operator === FilterOperatorKey.in) {
        selectedLinkedIds.forEach((id) => expect(itemIds).toContain(id));
        [...otherLinkedIds, ...unlinkedIds].forEach((id) => expect(itemIds).not.toContain(id));
      } else if (operator === FilterOperatorKey.notIn) {
        selectedLinkedIds.forEach((id) => expect(itemIds).not.toContain(id));
        [...otherLinkedIds, ...unlinkedIds].forEach((id) => expect(itemIds).toContain(id));
      } else if (operator === FilterOperatorKey.hasSome) {
        [...selectedLinkedIds, ...otherLinkedIds].forEach((id) => expect(itemIds).toContain(id));
        unlinkedIds.forEach((id) => expect(itemIds).not.toContain(id));
      } else {
        [...selectedLinkedIds, ...otherLinkedIds].forEach((id) => expect(itemIds).not.toContain(id));
        unlinkedIds.forEach((id) => expect(itemIds).toContain(id));
      }
    },
  );

  it("ORs membership values and ANDs independent relationship fields", async () => {
    const bothContacts = relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.in, [
      selectedContactId,
      otherContactId,
    ]);
    const sameRelationship = [
      relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.in, [selectedContactId]),
      relationshipFilter(FilterFieldKey.dealIds, FilterOperatorKey.in, [selectedDealId]),
    ];
    const disjointRelationship = [
      relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.in, [selectedContactId]),
      relationshipFilter(FilterFieldKey.dealIds, FilterOperatorKey.in, [otherDealId]),
    ];

    const [orCount, andItems, disjointCount] = await runWithTenant(tenant, async () => {
      const orRepo = makeRepo();
      const sameRepo = makeRepo();
      const disjointRepo = makeRepo();
      return Promise.all([
        orRepo.getCount({ filters: [bothContacts] }),
        sameRepo.getItems({ filters: sameRelationship, take: 100 }),
        disjointRepo.getCount({ filters: disjointRelationship }),
      ]);
    });

    expect(orCount).toBe(8);
    expect(andItems.map((item) => item.id).sort()).toEqual(
      [selectedMessageId, selectedActivityId, selectedCalendarEventId].sort(),
    );
    expect(disjointCount).toBe(0);
  });

  it("keeps list/count parity and stable non-overlapping pages", async () => {
    const filter = relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.hasNone);
    const repo = makeRepo();

    const [count, allItems, firstPage, repeatedFirstPage, secondPage, thirdPage] = await runWithTenant(tenant, () =>
      Promise.all([
        repo.getCount({ filters: [filter] }),
        repo.getItems({ filters: [filter], take: 100 }),
        repo.getItems({
          filters: [filter],
          pagination: { page: 1, pageSize: 5 },
        }),
        repo.getItems({
          filters: [filter],
          pagination: { page: 1, pageSize: 5 },
        }),
        repo.getItems({
          filters: [filter],
          pagination: { page: 2, pageSize: 5 },
        }),
        repo.getItems({
          filters: [filter],
          pagination: { page: 3, pageSize: 5 },
        }),
      ]),
    );

    const firstIds = firstPage.map((item) => item.id);
    const secondIds = secondPage.map((item) => item.id);
    const thirdIds = thirdPage.map((item) => item.id);
    const pagedIds = [...firstIds, ...secondIds, ...thirdIds];
    expect(count).toBe(12);
    expect(firstIds).toEqual(repeatedFirstPage.map((item) => item.id));
    expect(new Set(pagedIds).size).toBe(count);
    expect(pagedIds.sort()).toEqual(allItems.map((item) => item.id).sort());
    expect(firstPage).toHaveLength(5);
    expect(secondPage).toHaveLength(5);
    expect(thirdPage).toHaveLength(2);
  });
});
