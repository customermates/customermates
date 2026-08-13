import type { Filter } from "@/core/base/base-get.schema";

import { describe, it, expect, beforeEach, vi } from "vitest";

import { Action, EntityType, MessagingProvider, Resource } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { DomainEvent } from "@/features/event/domain-events";
import { ACTIVITY_SCOPE_CONTACT_MAX } from "../activity-scope.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

const { fake } = vi.hoisted(() => {
  const calls: Record<string, { op: string; args: any }[]> = {
    auditLog: [],
    messagingMessage: [],
    accountActivity: [],
    calendarEvent: [],
    connectedAccount: [],
    messagingThread: [],
    contact: [],
    organization: [],
    deal: [],
    service: [],
    task: [],
  };

  const contactRepoCalls: any[] = [];
  const contactIdsByGroup = new Map<string, string[]>();
  const unavailableRecordIds = new Set<string>();
  const contactIdentifiers: Array<{
    contactId: string;
    provider: string;
    value: string;
    messagingId: string | null;
  }> = [];
  const customColumns: any[] = [];

  const model = (name: string) => ({
    findMany: (args: any) => {
      calls[name].push({ op: "findMany", args });
      const ids = (args?.where?.id?.in ?? []).filter((id: string) => !unavailableRecordIds.has(id));
      if (name === "contact") return Promise.resolve(ids.map((id: string) => ({ id, firstName: id, lastName: "" })));
      if (["organization", "deal", "service", "task"].includes(name))
        return Promise.resolve(ids.map((id: string) => ({ id, name: id })));
      return Promise.resolve([]);
    },
    count: (args: any) => {
      calls[name].push({ op: "count", args });
      return Promise.resolve(0);
    },
  });

  return {
    fake: {
      calls,
      contactRepoCalls,
      contactIdsByGroup,
      unavailableRecordIds,
      contactIdentifiers,
      customColumns,
      reset() {
        for (const key of Object.keys(calls)) calls[key].length = 0;
        contactRepoCalls.length = 0;
        contactIdsByGroup.clear();
        unavailableRecordIds.clear();
        contactIdentifiers.length = 0;
        contactIdentifiers.push(
          {
            contactId: "contact-1",
            provider: "linkedin",
            value: "in-1",
            messagingId: "linkedin-member-1",
          },
          {
            contactId: "contact-1",
            provider: "google",
            value: "a@example.com",
            messagingId: null,
          },
        );
        customColumns.length = 0;
      },
      prisma: Object.fromEntries(Object.keys(calls).map((name) => [name, model(name)])),
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));
vi.mock("@/core/di", () => ({
  getContactRepo: () => ({
    resolveContactIdsForEntityTypeCompanyWide: (args: any) => {
      fake.contactRepoCalls.push(args);
      const key = `${args.entityType}:${(args.entityIds ?? []).join(",")}`;
      return Promise.resolve(fake.contactIdsByGroup.get(key) ?? []);
    },
    findContactIdentifierTargetsCompanyWide: () => Promise.resolve(fake.contactIdentifiers),
  }),
  getCustomColumnRepo: () => ({
    getCustomColumns: () => Promise.resolve(fake.customColumns),
  }),
}));

import { PrismaActivitiesRepo } from "../prisma-activities.repository";

function messagingRepo() {
  const repo = new PrismaActivitiesRepo();
  repo.setMessagingSourcesEnabled(true);
  return repo;
}

const reader = () =>
  createMockUserWithPermissions([
    { resource: Resource.auditLog, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readAll },
  ]);

async function run(scope?: Parameters<PrismaActivitiesRepo["setScope"]>[0]) {
  return runWithTenant(reader(), () => {
    const repo = messagingRepo();
    repo.setScope(scope);
    return repo.getItems({});
  });
}

const messageCalls = () => fake.calls.messagingMessage.filter((c) => c.op === "findMany");
const auditWhere = () => fake.calls.auditLog.find((c) => c.op === "findMany")?.args.where;
const sourceWhere = (source: string, op: "findMany" | "count") =>
  fake.calls[source].find((call) => call.op === op)?.args.where;

describe("activity scope", () => {
  beforeEach(() => fake.reset());

  it("reads the whole company when no scope is given", async () => {
    await run();

    expect(messageCalls()).toHaveLength(1);
    expect(auditWhere()).toEqual({ companyId: expect.any(String) });
  });

  it("loads custom columns for all record types globally and only selected types when scoped", async () => {
    fake.customColumns.push(
      { id: "contact-column", entityType: EntityType.contact },
      { id: "deal-column", entityType: EntityType.deal },
      { id: "task-column", entityType: EntityType.task },
    );

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      expect((await repo.getCustomColumns()).map(({ id }) => id)).toEqual([
        "contact-column",
        "deal-column",
        "task-column",
      ]);
      repo.setScope({ entityTypes: [EntityType.deal] });
      expect((await repo.getCustomColumns()).map(({ id }) => id)).toEqual(["deal-column"]);
    });
  });

  it("does not fall back to company-wide when a scope resolves to no contacts", async () => {
    await run({ records: [{ entityType: EntityType.deal, ids: ["d1"] }] });

    expect(messageCalls()).toHaveLength(0);
    expect(fake.calls.accountActivity.filter((c) => c.op === "findMany")).toHaveLength(0);
    expect(fake.calls.calendarEvent.filter((c) => c.op === "findMany")).toHaveLength(0);
  });

  it("does not resolve a whole record type the viewer cannot access", async () => {
    const limitedReader = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.readAll }]);
    fake.contactIdsByGroup.set("deal:", ["c1"]);

    await runWithTenant(limitedReader, async () => {
      const repo = messagingRepo();
      repo.setScope({ entityTypes: [EntityType.deal] });
      await repo.getItems({});
    });

    expect(fake.contactRepoCalls).toHaveLength(0);
    expect(messageCalls()).toHaveLength(0);
  });

  it("narrows the audit source to the selected records", async () => {
    await run({
      records: [{ entityType: EntityType.deal, ids: ["d1", "d2"] }],
    });

    expect(auditWhere()).toMatchObject({
      entityId: { in: ["d1", "d2"] },
      event: {
        in: expect.arrayContaining([DomainEvent.DEAL_CREATED, DomainEvent.DEAL_UPDATED]),
      },
    });
  });

  it("narrows the audit source to the events of the selected types", async () => {
    await run({ entityTypes: [EntityType.task] });

    expect(auditWhere()?.event.in.sort()).toEqual(
      [DomainEvent.TASK_CREATED, DomainEvent.TASK_UPDATED, DomainEvent.TASK_DELETED].sort(),
    );
  });

  it("unions records and entity types rather than intersecting them", async () => {
    await run({
      entityTypes: [EntityType.task],
      records: [{ entityType: EntityType.deal, ids: ["d1"] }],
    });

    const where = auditWhere();

    expect(where?.OR).toHaveLength(2);
    expect(where?.OR).toContainEqual({
      entityId: { in: ["d1"] },
      event: {
        in: expect.arrayContaining([DomainEvent.DEAL_CREATED, DomainEvent.DEAL_UPDATED]),
      },
    });
  });

  it("resolves contacts once per scope group, not once per record", async () => {
    fake.contactIdsByGroup.set("deal:d1,d2,d3", ["c1"]);

    await run({
      records: [{ entityType: EntityType.deal, ids: ["d1", "d2", "d3"] }],
    });

    expect(fake.contactRepoCalls).toHaveLength(1);
    expect(fake.contactRepoCalls[0].entityIds).toEqual(["d1", "d2", "d3"]);
  });

  it("resolves the scope once even though items and count both plan", async () => {
    fake.contactIdsByGroup.set("deal:d1", ["c1"]);

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      repo.setScope({
        records: [{ entityType: EntityType.deal, ids: ["d1"] }],
      });
      await Promise.all([repo.getItems({}), repo.getCount({})]);
    });

    expect(fake.contactRepoCalls).toHaveLength(1);
  });

  it("passes the resolved contacts to the messaging sources when the scope matched", async () => {
    fake.contactIdsByGroup.set("deal:d1", ["c1", "c2"]);

    await run({ records: [{ entityType: EntityType.deal, ids: ["d1"] }] });

    expect(messageCalls()).toHaveLength(1);
  });

  it("deduplicates contacts resolved through more than one scope group", async () => {
    fake.contactIdsByGroup.set("deal:d1", ["c1", "c2"]);
    fake.contactIdsByGroup.set("task:t1", ["c2", "c3"]);

    await run({
      records: [
        { entityType: EntityType.deal, ids: ["d1"] },
        { entityType: EntityType.task, ids: ["t1"] },
      ],
    });

    expect(fake.contactRepoCalls).toHaveLength(2);
    expect(messageCalls()).toHaveLength(1);
  });

  it("bounds a broad scope and surfaces truncation without querying contact-backed sources", async () => {
    fake.contactIdsByGroup.set(
      "deal:",
      Array.from({ length: ACTIVITY_SCOPE_CONTACT_MAX + 1 }, (_, index) => `contact-${index}`),
    );

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      repo.setScope({ entityTypes: [EntityType.deal] });
      await repo.getItems({});

      expect(await repo.isScopeTruncated()).toBe(true);
    });

    expect(fake.contactRepoCalls[0]?.limit).toBe(ACTIVITY_SCOPE_CONTACT_MAX + 1);
    expect(messageCalls()).toHaveLength(0);
    expect(fake.calls.accountActivity.filter((call) => call.op === "findMany")).toHaveLength(0);
    expect(fake.calls.calendarEvent.filter((call) => call.op === "findMany")).toHaveLength(0);
  });

  it("does not report contact-source truncation to an audit-only viewer", async () => {
    fake.contactIdsByGroup.set(
      "deal:",
      Array.from({ length: ACTIVITY_SCOPE_CONTACT_MAX + 1 }, (_, index) => `contact-${index}`),
    );
    const auditReader = createMockUserWithPermissions([
      { resource: Resource.auditLog, action: Action.readAll },
      { resource: Resource.deals, action: Action.readAll },
    ]);

    await runWithTenant(auditReader, async () => {
      const repo = new PrismaActivitiesRepo();
      repo.setScope({ entityTypes: [EntityType.deal] });
      await repo.getItems({});

      expect(await repo.isScopeTruncated()).toBe(false);
    });

    expect(fake.calls.auditLog.filter((call) => call.op === "findMany")).toHaveLength(1);
  });
});

const RELATIONSHIPS = [
  [FilterFieldKey.contactIds, EntityType.contact],
  [FilterFieldKey.organizationIds, EntityType.organization],
  [FilterFieldKey.dealIds, EntityType.deal],
  [FilterFieldKey.serviceIds, EntityType.service],
  [FilterFieldKey.taskIds, EntityType.task],
] as const;
const RELATIONSHIP_ID = "16000000-0000-4000-8000-000000000001";
const RELATIONSHIP_OPERATORS = [
  FilterOperatorKey.in,
  FilterOperatorKey.notIn,
  FilterOperatorKey.hasSome,
  FilterOperatorKey.hasNone,
] as const;
const MEMBERSHIP_OPERATORS = [FilterOperatorKey.in, FilterOperatorKey.notIn] as const;

function relationshipFilter(
  field: FilterFieldKey,
  operator: FilterOperatorKey.in | FilterOperatorKey.notIn | FilterOperatorKey.hasSome | FilterOperatorKey.hasNone,
): Filter {
  if (operator === FilterOperatorKey.hasSome || operator === FilterOperatorKey.hasNone)
    return { field, operator } as Filter;

  return { field, operator, value: [RELATIONSHIP_ID] } as Filter;
}

function valueFilter(
  field: FilterFieldKey,
  operator: FilterOperatorKey.in | FilterOperatorKey.notIn,
  value: string[],
): Filter {
  return { field, operator, value } as Filter;
}

describe("activity relationship filters", () => {
  beforeEach(() => fake.reset());

  it.each(
    RELATIONSHIPS.flatMap(([field, entityType]) =>
      RELATIONSHIP_OPERATORS.map((operator) => [field, entityType, operator] as const),
    ),
  )("compiles %s %s for audit and contact-backed sources", async (field, entityType, operator) => {
    const ids = operator === FilterOperatorKey.in || operator === FilterOperatorKey.notIn ? [RELATIONSHIP_ID] : [];
    fake.contactIdsByGroup.set(`${entityType}:${ids.join(",")}`, ["contact-1"]);

    await runWithTenant(reader(), () =>
      messagingRepo().getCount({
        filters: [relationshipFilter(field, operator)],
      }),
    );

    const positive = operator === FilterOperatorKey.in || operator === FilterOperatorKey.hasSome;
    const audit = sourceWhere("auditLog", "count");
    const messagePredicate = sourceWhere("messagingMessage", "count").AND[0];
    if (positive) expect(audit.NOT).toBeUndefined();
    else expect(audit.NOT).toEqual(expect.any(Object));
    if (ids.length) expect(positive ? audit.entityId.in : audit.NOT.entityId.in).toEqual(ids);
    expect(messagePredicate).toEqual(
      positive
        ? expect.objectContaining({ OR: expect.any(Array) })
        : expect.objectContaining({ AND: expect.any(Array) }),
    );
  });

  it("uses identical relationship predicates for list, count, and every contact-backed source", async () => {
    fake.contactIdsByGroup.set(`${EntityType.contact}:${RELATIONSHIP_ID}`, ["contact-1"]);

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      const filters = [relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.in)];
      await Promise.all([repo.getItems({ filters, take: 7 }), repo.getCount({ filters })]);
    });

    for (const source of ["messagingMessage", "accountActivity", "calendarEvent"])
      expect(sourceWhere(source, "findMany").AND[0]).toEqual(sourceWhere(source, "count").AND[0]);

    expect(sourceWhere("messagingMessage", "findMany").AND[0].OR).toEqual(expect.any(Array));
    expect(sourceWhere("accountActivity", "findMany").AND[0]).toEqual({
      identifier: { in: ["in-1", "linkedin-member-1"] },
    });
    expect(sourceWhere("calendarEvent", "findMany").AND[0]).toEqual({
      attendeeEmails: { hasSome: ["a@example.com"] },
    });
    expect(fake.calls.messagingMessage.find((call) => call.op === "findMany")?.args.take).toBe(7);
    expect(fake.contactRepoCalls).toHaveLength(1);
  });

  it("matches thread participants by both visible identifiers and provider user ids", async () => {
    fake.contactIdsByGroup.set(`${EntityType.contact}:${RELATIONSHIP_ID}`, ["contact-1"]);

    await runWithTenant(reader(), () =>
      messagingRepo().getCount({
        filters: [relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.in)],
      }),
    );

    const participantGroups = sourceWhere("messagingMessage", "count").AND[0].OR[0].thread.participants.some.OR;
    expect(participantGroups).toContainEqual(
      expect.objectContaining({
        provider: MessagingProvider.linkedin,
        OR: expect.arrayContaining([
          { identifier: { in: ["in-1"] } },
          { providerUserId: { in: ["linkedin-member-1"] } },
        ]),
      }),
    );
  });

  it("keeps nullable contact identifiers in negative relationship results", async () => {
    fake.contactIdsByGroup.set(`${EntityType.contact}:${RELATIONSHIP_ID}`, ["contact-1"]);

    await runWithTenant(reader(), () =>
      messagingRepo().getCount({
        filters: [relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.notIn)],
      }),
    );

    expect(sourceWhere("messagingMessage", "count").AND[0]).toMatchObject({
      AND: [{ NOT: expect.any(Object) }, { OR: [{ senderIdentifier: null }, { NOT: expect.any(Object) }] }],
    });
    expect(sourceWhere("accountActivity", "count").AND[0]).toEqual({
      OR: [{ identifier: null }, { NOT: { identifier: { in: ["in-1", "linkedin-member-1"] } } }],
    });
  });

  it("applies relationship filters to conversation options before their limit", async () => {
    fake.contactIdsByGroup.set(`${EntityType.organization}:${RELATIONSHIP_ID}`, ["contact-1"]);

    await runWithTenant(reader(), () =>
      messagingRepo().listThreadOptions({
        filters: [relationshipFilter(FilterFieldKey.organizationIds, FilterOperatorKey.in)] as never,
      }),
    );

    expect(sourceWhere("messagingThread", "findMany").AND[0]).toMatchObject({
      OR: [{ participants: { some: { OR: expect.any(Array) } } }, { messages: { some: { OR: expect.any(Array) } } }],
    });
    expect(fake.calls.messagingThread[0].args.take).toBe(100);
  });

  it("keeps conversation options whose individual messages pass a negative relationship", async () => {
    fake.contactIdsByGroup.set(`${EntityType.contact}:${RELATIONSHIP_ID}`, ["contact-1"]);

    await runWithTenant(reader(), () =>
      messagingRepo().listThreadOptions({
        filters: [relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.notIn)] as never,
      }),
    );

    expect(sourceWhere("messagingThread", "findMany").AND[0]).toMatchObject({
      AND: [
        { NOT: { participants: { some: { OR: expect.any(Array) } } } },
        { messages: { some: { OR: [{ senderIdentifier: null }, { NOT: expect.any(Object) }] } } },
      ],
    });
  });

  it("applies provider and connected-account context to conversation candidates", async () => {
    await runWithTenant(reader(), () =>
      messagingRepo().listThreadOptions({
        connectedAccountIds: [RELATIONSHIP_ID],
        filters: [
          valueFilter(FilterFieldKey.provider, FilterOperatorKey.in, ["google"]),
          valueFilter(FilterFieldKey.connectedAccountId, FilterOperatorKey.in, [RELATIONSHIP_ID]),
        ] as never,
      }),
    );

    expect(fake.calls.messagingThread[0].args.where).toMatchObject({
      provider: { in: ["google"] },
      connectedAccountId: { in: [RELATIONSHIP_ID] },
    });
  });

  it.each(MEMBERSHIP_OPERATORS)(
    "hydrates an off-page %s conversation through access-only constraints",
    async (operator) => {
      await runWithTenant(reader(), () =>
        messagingRepo().listThreadOptions({
          filters: [
            valueFilter(FilterFieldKey.provider, FilterOperatorKey.in, ["google"]),
            valueFilter(FilterFieldKey.timelineThreadId, operator, [RELATIONSHIP_ID]),
          ] as never,
        }),
      );

      expect(fake.calls.messagingThread).toHaveLength(2);
      expect(fake.calls.messagingThread[1].args.where).toMatchObject({
        id: { in: [RELATIONSHIP_ID] },
      });
      expect(fake.calls.messagingThread[1].args.where).not.toHaveProperty("provider");
    },
  );

  it("fails closed for a stale explicit record id", async () => {
    fake.unavailableRecordIds.add(RELATIONSHIP_ID);

    await runWithTenant(reader(), () =>
      messagingRepo().getCount({
        filters: [relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.notIn)],
      }),
    );

    expect(sourceWhere("auditLog", "count")).toMatchObject({ id: { in: [] } });
    expect(fake.calls.messagingMessage.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.calls.accountActivity.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.calls.calendarEvent.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.contactRepoCalls).toHaveLength(0);
  });

  it("fails closed when the relationship entity permission is absent", async () => {
    const noContactAccess = createMockUserWithPermissions([
      { resource: Resource.auditLog, action: Action.readAll },
      { resource: Resource.inboxMessages, action: Action.readAll },
    ]);

    await runWithTenant(noContactAccess, () =>
      messagingRepo().getCount({
        filters: [relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.hasSome)],
      }),
    );

    expect(sourceWhere("auditLog", "count")).toMatchObject({ id: { in: [] } });
    expect(fake.calls.messagingMessage.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.contactRepoCalls).toHaveLength(0);
  });

  it("keeps direct audit filtering but suppresses contact-backed sources above the safety cap", async () => {
    fake.contactIdsByGroup.set(
      `${EntityType.deal}:`,
      Array.from({ length: ACTIVITY_SCOPE_CONTACT_MAX + 1 }, (_, index) => `contact-${index}`),
    );

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      await repo.getCount({
        filters: [relationshipFilter(FilterFieldKey.dealIds, FilterOperatorKey.hasSome)],
      });
      expect(await repo.isScopeTruncated()).toBe(true);
    });

    expect(sourceWhere("auditLog", "count").event.in).toEqual(expect.any(Array));
    expect(fake.calls.messagingMessage.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.calls.accountActivity.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.calls.calendarEvent.filter((call) => call.op === "count")).toHaveLength(0);
  });

  it("enforces the contact safety cap across all relationship expansions", async () => {
    fake.contactIdsByGroup.set(
      `${EntityType.deal}:`,
      Array.from({ length: 300 }, (_, index) => `deal-contact-${index}`),
    );
    fake.contactIdsByGroup.set(
      `${EntityType.task}:`,
      Array.from({ length: 300 }, (_, index) => `task-contact-${index}`),
    );

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      await repo.getCount({
        filters: [
          relationshipFilter(FilterFieldKey.dealIds, FilterOperatorKey.hasSome),
          relationshipFilter(FilterFieldKey.taskIds, FilterOperatorKey.hasSome),
        ],
      });
      expect(await repo.isScopeTruncated()).toBe(true);
    });

    expect(fake.contactRepoCalls).toHaveLength(2);
    expect(fake.calls.messagingMessage.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.calls.accountActivity.filter((call) => call.op === "count")).toHaveLength(0);
    expect(fake.calls.calendarEvent.filter((call) => call.op === "count")).toHaveLength(0);
  });

  it("validates every rule before an earlier broad expansion can return", async () => {
    fake.contactIdsByGroup.set(
      `${EntityType.deal}:`,
      Array.from({ length: ACTIVITY_SCOPE_CONTACT_MAX + 1 }, (_, index) => `deal-contact-${index}`),
    );
    fake.unavailableRecordIds.add(RELATIONSHIP_ID);

    await runWithTenant(reader(), () =>
      messagingRepo().getCount({
        filters: [
          relationshipFilter(FilterFieldKey.dealIds, FilterOperatorKey.hasNone),
          relationshipFilter(FilterFieldKey.contactIds, FilterOperatorKey.in),
        ],
      }),
    );

    expect(sourceWhere("auditLog", "count")).toMatchObject({ id: { in: [] } });
    expect(fake.contactRepoCalls).toHaveLength(0);
    expect(fake.calls.messagingMessage.filter((call) => call.op === "count")).toHaveLength(0);
  });

  it("ANDs the low-level entity scope with widget relationship filters", async () => {
    fake.contactIdsByGroup.set(`${EntityType.deal}:d1`, ["contact-1"]);
    fake.contactIdsByGroup.set(`${EntityType.task}:`, ["contact-1"]);

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      repo.setScope({
        records: [{ entityType: EntityType.deal, ids: ["d1"] }],
      });
      await repo.getCount({
        filters: [relationshipFilter(FilterFieldKey.taskIds, FilterOperatorKey.hasSome)],
      });
    });

    expect(sourceWhere("auditLog", "count").AND).toHaveLength(2);
    expect(sourceWhere("messagingMessage", "count").AND.slice(0, 2)).toHaveLength(2);
  });

  it("caps the combined contact union from low-level scope and relationship filters", async () => {
    fake.contactIdsByGroup.set(
      `${EntityType.deal}:`,
      Array.from({ length: 300 }, (_, index) => `deal-contact-${index}`),
    );
    fake.contactIdsByGroup.set(
      `${EntityType.task}:`,
      Array.from({ length: 300 }, (_, index) => `task-contact-${index}`),
    );

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      repo.setScope({ entityTypes: [EntityType.deal] });
      await repo.getCount({
        filters: [relationshipFilter(FilterFieldKey.taskIds, FilterOperatorKey.hasSome)],
      });
      expect(await repo.isScopeTruncated()).toBe(true);
    });

    expect(fake.contactRepoCalls).toHaveLength(2);
    expect(fake.calls.messagingMessage.filter((call) => call.op === "count")).toHaveLength(0);
  });

  it("allows a combined scope and filter union at the contact cap", async () => {
    fake.contactIdsByGroup.set(
      `${EntityType.deal}:`,
      Array.from({ length: 300 }, (_, index) => `contact-${index}`),
    );
    fake.contactIdsByGroup.set(
      `${EntityType.task}:`,
      Array.from({ length: 300 }, (_, index) => `contact-${index + 200}`),
    );

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      repo.setScope({ entityTypes: [EntityType.deal] });
      await repo.getCount({
        filters: [relationshipFilter(FilterFieldKey.taskIds, FilterOperatorKey.hasSome)],
      });
      expect(await repo.isScopeTruncated()).toBe(false);
    });

    expect(fake.calls.messagingMessage.filter((call) => call.op === "count")).toHaveLength(1);
  });

  it("reuses one contact expansion when scope and filter request the same group", async () => {
    fake.contactIdsByGroup.set(`${EntityType.task}:`, ["contact-1"]);

    await runWithTenant(reader(), async () => {
      const repo = messagingRepo();
      repo.setScope({ entityTypes: [EntityType.task] });
      await repo.getCount({
        filters: [relationshipFilter(FilterFieldKey.taskIds, FilterOperatorKey.hasSome)],
      });
    });

    expect(fake.contactRepoCalls).toHaveLength(1);
  });
});
