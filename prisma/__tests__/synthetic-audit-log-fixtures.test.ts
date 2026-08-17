import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { calculateChanges } from "@/core/utils/calculate-changes";
import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";
import { AUDIT_LOG_EXCLUDED_EVENTS, DomainEvent } from "@/features/event/domain-events";

import {
  buildSyntheticAuditLogFixtures,
  persistSyntheticAuditLogFixtures,
  SYNTHETIC_AUDIT_LOG_ID_PREFIX,
  SYNTHETIC_CONTACT_UPDATE_INDEXES,
  SYNTHETIC_DEAL_UPDATE_INDEXES,
  SYNTHETIC_ORGANIZATION_UPDATE_INDEXES,
  SYNTHETIC_TASK_UPDATE_INDEXES,
  type SyntheticAuditFixture,
  type SyntheticAuditSnapshot,
} from "../seeds/audit-logs";
import { SYNTHETIC_CONTACT_AVATAR_URLS } from "../seeds/avatars";
import { SEED_IDS } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_IDS } from "../seeds/custom-fields";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_CUSTOM_ROLES } from "../seeds/roles";
import { SYNTHETIC_CUSTOM_COLUMN_UPDATE_INDEXES, SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";
import { SYNTHETIC_WEBHOOK_DESCRIPTION, SYNTHETIC_WEBHOOK_URL } from "../seeds/webhooks";

const primaryUserReference = {
  id: SEED_IDS.user,
  email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
  firstName: SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
  lastName: SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
  avatarUrl: "https://customermates.com/demo/avatars/photos/max-bergmann.png",
};

function syntheticSnapshot(): SyntheticAuditSnapshot {
  const users = [
    {
      ...primaryUserReference,
      ...SYNTHETIC_SEED_TIMELINE.user(0),
      country: "de" as const,
      roleId: SEED_IDS.role,
      status: "active" as const,
    },
    {
      id: SEED_IDS.sofiaRossiUser,
      email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
      firstName: SYNTHETIC_COMPANY_USERS.sofiaRossi.firstName,
      lastName: SYNTHETIC_COMPANY_USERS.sofiaRossi.lastName,
      avatarUrl: "https://customermates.com/demo/avatars/photos/sofia-rossi.png",
      country: "it" as const,
      roleId: SEED_IDS.salesManagerRole,
      status: "active" as const,
      ...SYNTHETIC_SEED_TIMELINE.user(1),
    },
    {
      id: SEED_IDS.elenaHoffmannUser,
      email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
      firstName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
      lastName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
      avatarUrl: "https://customermates.com/demo/avatars/photos/elena-hoffmann.png",
      country: "de" as const,
      roleId: SEED_IDS.customerSuccessRole,
      status: "active" as const,
      ...SYNTHETIC_SEED_TIMELINE.user(2),
    },
  ];

  const organizations = Array.from({ length: 19 }, (_, index) => ({
    id: fixtureId("70000000", index + 1),
    name: `Organization ${index + 1}`,
    notes: null,
    ...SYNTHETIC_SEED_TIMELINE.organization(index),
    contacts: [],
    users: [primaryUserReference],
    deals: [],
    tasks: [],
    customFieldValues: [
      {
        columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
        value: `https://organization-${index + 1}.example.com`,
      },
    ],
  }));

  const contacts = Array.from({ length: 30 }, (_, index) => ({
    id: fixtureId("60000000", index + 1),
    firstName: `Contact ${index + 1}`,
    lastName: "Example",
    avatarUrl: SYNTHETIC_CONTACT_AVATAR_URLS[index],
    notes: null,
    identifiers: [
      {
        id: fixtureId("b0000000", index + 1),
        provider: "mail" as const,
        value: `contact-${index + 1}@example.com`,
        messagingId: null,
        displayName: null,
        profileUrl: null,
      },
    ],
    ...SYNTHETIC_SEED_TIMELINE.contact(index),
    organizations: [{ id: organizations[index % organizations.length].id, name: organizations[index % 19].name }],
    users: [primaryUserReference],
    deals: [],
    tasks: [],
    customFieldValues: [],
  }));

  const services = Array.from({ length: 43 }, (_, index) => ({
    id: fixtureId("90000000", index + 1),
    name: `Service ${index + 1}`,
    amount: 1_000 + index * 100,
    notes: null,
    ...SYNTHETIC_SEED_TIMELINE.service(index),
    users: [primaryUserReference],
    deals: [],
    tasks: [],
    customFieldValues: [],
  }));

  const deals = Array.from({ length: 10 }, (_, index) => {
    const service = services[index];
    const quantity = index + 1;
    return {
      id: fixtureId("80000000", index + 1),
      name: `Deal ${index + 1}`,
      totalQuantity: quantity,
      totalValue: service.amount * quantity,
      weightedValue: null,
      notes: null,
      ...SYNTHETIC_SEED_TIMELINE.deal(index),
      organizations: [{ id: organizations[index].id, name: organizations[index].name }],
      users: [primaryUserReference],
      contacts: [],
      services: [{ id: service.id, name: service.name, amount: service.amount, quantity }],
      tasks: [],
      customFieldValues: [],
    };
  });

  const tasks = Array.from({ length: 15 }, (_, index) => ({
    id: fixtureId("a0000000", index + 1),
    name: index === 6 ? "Prepare Q3 sales pipeline review" : `Task ${index + 1}`,
    type: "custom" as const,
    notes: null,
    ...SYNTHETIC_SEED_TIMELINE.task(index),
    users: index === 6 ? [] : [primaryUserReference],
    contacts:
      index === 6
        ? []
        : [
            {
              id: contacts[index].id,
              firstName: contacts[index].firstName,
              lastName: contacts[index].lastName,
              avatarUrl: contacts[index].avatarUrl,
            },
          ],
    organizations:
      index === 6 ? [] : [{ id: organizations[index % organizations.length].id, name: organizations[index % 19].name }],
    deals: index === 6 ? [] : [{ id: deals[index % deals.length].id, name: deals[index % 10].name }],
    services:
      index === 6 ? [] : [{ id: services[index].id, name: services[index].name, amount: services[index].amount }],
    customFieldValues: [],
  }));

  return {
    connectedAccounts: ["google", "linkedin", "whatsapp"].map((provider, index) => ({
      id: fixtureId("16000000", index + 1),
      provider: provider as "google" | "linkedin" | "whatsapp",
      displayName: `Max Bergmann · ${provider}`,
      emailAddress: provider === "google" ? primaryUserReference.email : null,
      createdAt: SYNTHETIC_SEED_TIMELINE.connectedAccount(index).createdAt,
    })),
    users,
    roles: SYNTHETIC_CUSTOM_ROLES.map(({ companyId: _companyId, permissions, ...role }, index) => ({
      ...role,
      ...SYNTHETIC_SEED_TIMELINE.customRole(index),
      permissions: permissions.map(({ companyId: _permissionCompanyId, roleId: _roleId, ...permission }) => permission),
    })),
    customColumns: Array.from({ length: 10 }, (_, index) => ({
      ...SYNTHETIC_SEED_TIMELINE.customColumn(index),
      dto: {
        id: fixtureId("16000000", index + 1),
        entityType: "contact" as const,
        label: `Synthetic column ${index + 1}`,
        type: "plain" as const,
      },
    })),
    organizations,
    contacts,
    services,
    deals,
    tasks,
    webhook: {
      id: fixtureId("22000000", 1),
      url: SYNTHETIC_WEBHOOK_URL,
      description: SYNTHETIC_WEBHOOK_DESCRIPTION,
      events: [
        DomainEvent.CONTACT_CREATED,
        DomainEvent.CONTACT_UPDATED,
        DomainEvent.DEAL_CREATED,
        DomainEvent.DEAL_UPDATED,
        DomainEvent.ORGANIZATION_CREATED,
        DomainEvent.ORGANIZATION_UPDATED,
      ],
      secret: null,
      enabled: false,
      ...SYNTHETIC_SEED_TIMELINE.webhook,
    },
  };
}

function buildFixtures(snapshot = syntheticSnapshot()): SyntheticAuditFixture[] {
  return buildSyntheticAuditLogFixtures({
    companyId: SEED_IDS.company,
    primaryUserId: SEED_IDS.user,
    snapshot,
  });
}

function eventData(fixture: SyntheticAuditFixture): Record<string, unknown> {
  return fixture.eventData as unknown as Record<string, unknown>;
}

function eventPayload(fixture: SyntheticAuditFixture): Record<string, unknown> {
  return eventData(fixture).payload as Record<string, unknown>;
}

function fixturesFor(fixtures: SyntheticAuditFixture[], event: DomainEvent): SyntheticAuditFixture[] {
  return fixtures.filter((fixture) => fixture.event === event);
}

function fixtureForEntity(
  fixtures: SyntheticAuditFixture[],
  event: DomainEvent,
  entityId: string,
): SyntheticAuditFixture {
  const fixture = fixtures.find((candidate) => candidate.event === event && candidate.entityId === entityId);
  if (!fixture) throw new Error(`Missing ${event} fixture for ${entityId}`);
  return fixture;
}

describe("synthetic audit-log fixtures", () => {
  it("contains only events EventService would persist and keeps the database actor honest", () => {
    const snapshot = syntheticSnapshot();
    const fixtures = buildFixtures(snapshot);
    const expectedCountsByEvent = {
      connectedAccountCreated: snapshot.connectedAccounts.length,
      contactCreated: snapshot.contacts.length,
      contactUpdated: SYNTHETIC_CONTACT_UPDATE_INDEXES.length,
      customColumnCreated: snapshot.customColumns.length,
      customColumnUpdated: SYNTHETIC_CUSTOM_COLUMN_UPDATE_INDEXES.length,
      dealCreated: snapshot.deals.length,
      dealUpdated: SYNTHETIC_DEAL_UPDATE_INDEXES.length,
      organizationCreated: snapshot.organizations.length,
      organizationUpdated: SYNTHETIC_ORGANIZATION_UPDATE_INDEXES.length,
      roleCreated: snapshot.roles.length,
      serviceCreated: snapshot.services.length,
      taskCreated: snapshot.tasks.filter(({ type }) => type === "custom").length,
      taskUpdated: SYNTHETIC_TASK_UPDATE_INDEXES.length,
      userRegistered: snapshot.users.length,
      userUpdated: snapshot.users.filter(
        ({ id, roleId, status }) => id !== SEED_IDS.user && status === "active" && roleId !== null,
      ).length,
      webhookCreated: 1,
      webhookUpdated: 1,
    };
    const expectedAuditLogCount = Object.values(expectedCountsByEvent).reduce((total, count) => total + count, 0);

    expect(expectedAuditLogCount).toBe(161);
    expect(fixtures).toHaveLength(expectedAuditLogCount);
    expect(new Set(fixtures.map(({ id }) => id))).toHaveLength(fixtures.length);
    expect(fixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_AUDIT_LOG_ID_PREFIX}-`))).toBe(true);
    expect(fixtures.every(({ event }) => !AUDIT_LOG_EXCLUDED_EVENTS.has(event))).toBe(true);
    expect(fixtures.some(({ event }) => event.startsWith("messaging."))).toBe(false);
    expect(buildFixtures(snapshot)).toEqual(fixtures);

    const timestamps = fixtures.map(({ createdAt }) => createdAt.getTime());
    const earliest = Math.min(...timestamps);
    const latest = Math.max(...timestamps);
    const reference = Date.parse("2026-08-06T00:00:00.000Z");
    const coveredMonths = new Set(
      fixtures.map(({ createdAt }) => `${createdAt.getUTCFullYear()}-${createdAt.getUTCMonth()}`),
    );

    expect(earliest).toBeGreaterThanOrEqual(reference - 365 * 24 * 60 * 60_000);
    expect(earliest).toBeLessThanOrEqual(reference - 360 * 24 * 60 * 60_000);
    expect(latest).toBeLessThan(reference);
    expect(coveredMonths.size).toBeGreaterThanOrEqual(10);

    for (const fixture of fixtures) {
      expect(eventData(fixture)).toMatchObject({
        companyId: fixture.companyId,
        entityId: fixture.entityId,
        userId: fixture.userId,
      });
    }

    expect(fixturesFor(fixtures, DomainEvent.USER_REGISTERED)).toHaveLength(snapshot.users.length);
    expect(fixturesFor(fixtures, DomainEvent.ROLE_CREATED)).toHaveLength(snapshot.roles.length);
    expect(fixturesFor(fixtures, DomainEvent.CUSTOM_COLUMN_CREATED)).toHaveLength(snapshot.customColumns.length);
    expect(fixturesFor(fixtures, DomainEvent.ORGANIZATION_CREATED)).toHaveLength(snapshot.organizations.length);
    expect(fixturesFor(fixtures, DomainEvent.CONTACT_CREATED)).toHaveLength(snapshot.contacts.length);
    expect(fixturesFor(fixtures, DomainEvent.SERVICE_CREATED)).toHaveLength(snapshot.services.length);
    expect(fixturesFor(fixtures, DomainEvent.DEAL_CREATED)).toHaveLength(snapshot.deals.length);
    expect(fixturesFor(fixtures, DomainEvent.TASK_CREATED)).toHaveLength(
      snapshot.tasks.filter(({ type }) => type === "custom").length,
    );
    expect(fixturesFor(fixtures, DomainEvent.CONNECTED_ACCOUNT_CREATED)).toHaveLength(
      snapshot.connectedAccounts.length,
    );
  });

  it("models registration and authorization exactly like their publishers", () => {
    const fixtures = buildFixtures();
    const registrations = fixturesFor(fixtures, DomainEvent.USER_REGISTERED);
    const updates = fixturesFor(fixtures, DomainEvent.USER_UPDATED);

    const primaryRegistration = fixtureForEntity(registrations, DomainEvent.USER_REGISTERED, SEED_IDS.user);
    const pendingRegistration = fixtureForEntity(registrations, DomainEvent.USER_REGISTERED, SEED_IDS.sofiaRossiUser);
    const activeRegistration = fixtureForEntity(registrations, DomainEvent.USER_REGISTERED, SEED_IDS.elenaHoffmannUser);

    expect(primaryRegistration).toMatchObject({ userId: SEED_IDS.user });
    expect(eventPayload(primaryRegistration)).toMatchObject({
      isNewCompany: true,
      status: "active",
      roleId: SEED_IDS.role,
    });
    expect(eventPayload(pendingRegistration)).toMatchObject({
      isNewCompany: false,
      status: "pendingAuthorization",
      roleId: null,
    });
    expect(eventPayload(activeRegistration)).toMatchObject({
      isNewCompany: false,
      status: "pendingAuthorization",
      roleId: null,
    });
    expect(updates).toHaveLength(2);
    expect(updates.map(({ entityId, userId }) => ({ entityId, userId }))).toEqual([
      { entityId: SEED_IDS.sofiaRossiUser, userId: SEED_IDS.user },
      { entityId: SEED_IDS.elenaHoffmannUser, userId: SEED_IDS.user },
    ]);
    expect(eventPayload(fixtureForEntity(updates, DomainEvent.USER_UPDATED, SEED_IDS.sofiaRossiUser))).toMatchObject({
      status: "active",
      roleId: SEED_IDS.salesManagerRole,
    });
    expect(eventPayload(fixtureForEntity(updates, DomainEvent.USER_UPDATED, SEED_IDS.elenaHoffmannUser))).toMatchObject(
      {
        status: "active",
        roleId: SEED_IDS.customerSuccessRole,
      },
    );
  });

  it("never references an entity before creation and keeps deal totals coherent", () => {
    const fixtures = buildFixtures();
    const creationTime = new Map(
      fixtures
        .filter(({ event }) => event.endsWith(".created") || event === DomainEvent.USER_REGISTERED)
        .map(({ entityId, createdAt }) => [entityId, createdAt.getTime()]),
    );
    const assertCreated = (reference: { id: string }, fixture: SyntheticAuditFixture) => {
      expect(creationTime.get(reference.id), `${reference.id} needs a creation event`).toBeLessThanOrEqual(
        fixture.createdAt.getTime(),
      );
    };

    for (const fixture of fixturesFor(fixtures, DomainEvent.ORGANIZATION_CREATED)) {
      const payload = eventPayload(fixture);
      expect(payload).toMatchObject({ contacts: [], deals: [], tasks: [] });
      for (const user of payload.users as { id: string }[]) assertCreated(user, fixture);
    }

    for (const fixture of fixturesFor(fixtures, DomainEvent.CONTACT_CREATED)) {
      const payload = eventPayload(fixture);
      expect(payload).toMatchObject({ avatarUrl: null, deals: [], tasks: [] });
      for (const relation of [...(payload.organizations as { id: string }[]), ...(payload.users as { id: string }[])])
        assertCreated(relation, fixture);
    }

    for (const fixture of fixturesFor(fixtures, DomainEvent.SERVICE_CREATED))
      expect(eventPayload(fixture)).toMatchObject({ deals: [], tasks: [] });

    for (const fixture of fixturesFor(fixtures, DomainEvent.DEAL_CREATED)) {
      const payload = eventPayload(fixture);
      expect(payload).toMatchObject({ tasks: [] });
      const services = payload.services as { id: string; amount: number; quantity: number }[];
      expect(payload.totalQuantity).toBe(services.reduce((sum, service) => sum + service.quantity, 0));
      expect(payload.totalValue).toBe(services.reduce((sum, service) => sum + service.amount * service.quantity, 0));
      for (const relation of [
        ...(payload.organizations as { id: string }[]),
        ...(payload.users as { id: string }[]),
        ...services,
      ])
        assertCreated(relation, fixture);
    }

    for (const fixture of fixturesFor(fixtures, DomainEvent.TASK_CREATED)) {
      const payload = eventPayload(fixture);
      expect(payload.type).toBe("custom");
      for (const relation of [
        ...(payload.users as { id: string }[]),
        ...(payload.contacts as { id: string }[]),
        ...(payload.organizations as { id: string }[]),
        ...(payload.deals as { id: string }[]),
        ...(payload.services as { id: string }[]),
      ])
        assertCreated(relation, fixture);
    }
  });

  it("derives every entity update from its matching creation state", () => {
    const fixtures = buildFixtures();
    const lifecycle = [
      [DomainEvent.CUSTOM_COLUMN_CREATED, DomainEvent.CUSTOM_COLUMN_UPDATED, "customColumn"],
      [DomainEvent.ORGANIZATION_CREATED, DomainEvent.ORGANIZATION_UPDATED, "organization"],
      [DomainEvent.CONTACT_CREATED, DomainEvent.CONTACT_UPDATED, "contact"],
      [DomainEvent.DEAL_CREATED, DomainEvent.DEAL_UPDATED, "deal"],
      [DomainEvent.TASK_CREATED, DomainEvent.TASK_UPDATED, "task"],
      [DomainEvent.WEBHOOK_CREATED, DomainEvent.WEBHOOK_UPDATED, "webhook"],
    ] as const;

    for (const [createdEvent, updatedEvent, entityKey] of lifecycle) {
      const creations = fixturesFor(fixtures, createdEvent);
      for (const update of fixturesFor(fixtures, updatedEvent)) {
        const creation = creations.find(({ entityId }) => entityId === update.entityId);
        expect(creation, `${updatedEvent} needs a creation event`).toBeDefined();
        if (!creation) continue;

        const payload = eventPayload(update);
        const current = payload[entityKey] as Record<string, unknown>;
        const changes = payload.changes as Record<string, { previous: unknown; current: unknown }>;
        expect(update.createdAt.getTime()).toBeGreaterThan(creation.createdAt.getTime());
        expect(Object.keys(changes).length).toBeGreaterThan(0);
        const previous =
          updatedEvent === DomainEvent.CONTACT_UPDATED
            ? { ...current, firstName: changes.firstName?.previous }
            : eventPayload(creation);
        expect(changes).toEqual(calculateChanges(previous, current));
        for (const change of Object.values(changes)) expect(change.previous).not.toEqual(change.current);
        if (updatedEvent === DomainEvent.CONTACT_UPDATED) {
          expect(current.avatarUrl).not.toBeNull();
          expect(changes).not.toHaveProperty("avatarUrl");
        }
      }
    }

    expect(fixturesFor(fixtures, DomainEvent.ORGANIZATION_UPDATED)).toHaveLength(
      SYNTHETIC_ORGANIZATION_UPDATE_INDEXES.length,
    );
    expect(fixturesFor(fixtures, DomainEvent.CONTACT_UPDATED)).toHaveLength(SYNTHETIC_CONTACT_UPDATE_INDEXES.length);
    expect(fixturesFor(fixtures, DomainEvent.DEAL_UPDATED)).toHaveLength(SYNTHETIC_DEAL_UPDATE_INDEXES.length);
    expect(fixturesFor(fixtures, DomainEvent.TASK_UPDATED)).toHaveLength(SYNTHETIC_TASK_UPDATE_INDEXES.length);
  });

  it("records a real disabled-webhook lifecycle around its historical deliveries", () => {
    const fixtures = buildFixtures();
    const created = fixturesFor(fixtures, DomainEvent.WEBHOOK_CREATED)[0];
    const updated = fixturesFor(fixtures, DomainEvent.WEBHOOK_UPDATED)[0];

    expect(eventPayload(created)).toMatchObject({
      id: fixtureId("22000000", 1),
      enabled: true,
      description: null,
      secret: null,
    });
    expect(eventPayload(updated)).toMatchObject({
      webhook: {
        enabled: false,
        description: SYNTHETIC_WEBHOOK_DESCRIPTION,
        url: SYNTHETIC_WEBHOOK_URL,
      },
      changes: {
        description: { previous: null, current: SYNTHETIC_WEBHOOK_DESCRIPTION },
        enabled: { previous: true, current: false },
      },
    });
    expect(created.createdAt.getTime()).toBeLessThan(SYNTHETIC_SEED_TIMELINE.webhookDelivery(0).getTime());
    expect(updated.createdAt.getTime()).toBeGreaterThan(SYNTHETIC_SEED_TIMELINE.webhookDelivery(13).getTime());
  });

  it("upserts idempotently and removes only stale deterministic audit rows", async () => {
    const fixtures = buildFixtures();
    const rows = new Map<string, SyntheticAuditFixture | { id: string; companyId: string }>([
      ["unrelated-audit-row", { id: "unrelated-audit-row", companyId: SEED_IDS.company }],
      [
        fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, 999),
        { id: fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, 999), companyId: SEED_IDS.company },
      ],
    ]);
    const prisma = {
      auditLog: {
        upsert: vi.fn((input: { create: SyntheticAuditFixture; where: { id: string } }) => {
          rows.set(input.where.id, input.create);
          return Promise.resolve(input.create);
        }),
        deleteMany: vi.fn((input: { where: { companyId: string; id: { startsWith: string; notIn: string[] } } }) => {
          const keep = new Set(input.where.id.notIn);
          let count = 0;
          for (const [id, row] of rows) {
            if (row.companyId !== input.where.companyId || !id.startsWith(input.where.id.startsWith) || keep.has(id))
              continue;
            rows.delete(id);
            count += 1;
          }
          return Promise.resolve({ count });
        }),
      },
    } as unknown as Pick<PrismaClient, "auditLog">;

    await persistSyntheticAuditLogFixtures(prisma, SEED_IDS.company, fixtures);
    await persistSyntheticAuditLogFixtures(prisma, SEED_IDS.company, fixtures);

    expect(rows).toHaveLength(fixtures.length + 1);
    expect(rows.has("unrelated-audit-row")).toBe(true);
    expect(rows.has(fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, 999))).toBe(false);

    await persistSyntheticAuditLogFixtures(prisma, SEED_IDS.company, fixtures.slice(0, -1));
    expect(rows).toHaveLength(fixtures.length);
    expect(rows.has(fixtures.at(-1)?.id ?? "")).toBe(false);
    expect(rows.has("unrelated-audit-row")).toBe(true);
  });
});
