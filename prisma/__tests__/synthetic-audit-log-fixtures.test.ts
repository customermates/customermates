import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { extractAuditChanges } from "@/ee/audit-log/audit-log-changes";
import { DomainEvent } from "@/features/event/domain-events";
import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import {
  buildSyntheticAuditLogFixtures,
  persistSyntheticAuditLogFixtures,
  SYNTHETIC_AUDIT_LOG_COUNT,
  SYNTHETIC_AUDIT_LOG_ID_PREFIX,
  SYNTHETIC_CHAT_LINKED_CONTACT_INDEXES,
  SYNTHETIC_CONTACT_UPDATE_INDEXES,
  type SyntheticAuditFixture,
  type SyntheticAuditSnapshot,
} from "../seeds/audit-logs";
import { SYNTHETIC_CONTACT_AVATAR_PATHS } from "../seeds/avatars";
import { SEED_IDS } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_IDS } from "../seeds/custom-fields";
import { fixtureId } from "../seeds/helpers";
import { threads as messagingThreads } from "../seeds/messaging/fixtures";
import { SYNTHETIC_CUSTOM_ROLES } from "../seeds/roles";

const stamp = new Date("2026-01-15T12:00:00.000Z");

const primaryUser = {
  id: SEED_IDS.user,
  email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
  firstName: SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
  lastName: SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
  avatarUrl: "/demo/avatars/photos/max-bergmann.png",
};

function syntheticSnapshot(): SyntheticAuditSnapshot {
  return {
    company: { currency: "eur", updatedAt: stamp },
    connectedAccounts: [
      {
        id: fixtureId("16000000", 1),
        provider: "google",
        displayName: "Max Bergmann · Gmail",
        emailAddress: primaryUser.email,
        createdAt: stamp,
      },
      {
        id: fixtureId("16000000", 2),
        provider: "linkedin",
        displayName: "Max Bergmann · LinkedIn",
        emailAddress: null,
        createdAt: stamp,
      },
      {
        id: fixtureId("16000000", 3),
        provider: "whatsapp",
        displayName: "Max Bergmann · WhatsApp",
        emailAddress: null,
        createdAt: stamp,
      },
    ],
    users: [
      {
        ...primaryUser,
        country: "de",
        createdAt: stamp,
        roleId: SEED_IDS.role,
        status: "active",
      },
      {
        id: SEED_IDS.pendingUser,
        email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
        firstName: SYNTHETIC_COMPANY_USERS.sofiaRossi.firstName,
        lastName: SYNTHETIC_COMPANY_USERS.sofiaRossi.lastName,
        avatarUrl: "/demo/avatars/photos/sofia-rossi.png",
        country: "it",
        createdAt: stamp,
        roleId: null,
        status: "pendingAuthorization",
      },
      {
        id: SEED_IDS.activeUser,
        email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
        firstName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
        lastName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
        avatarUrl: "/demo/avatars/photos/elena-hoffmann.png",
        country: "de",
        createdAt: stamp,
        roleId: SEED_IDS.customerSuccessRole,
        status: "active",
      },
    ],
    roles: SYNTHETIC_CUSTOM_ROLES.map(({ companyId: _companyId, permissions, ...role }) => ({
      ...role,
      createdAt: stamp,
      updatedAt: stamp,
      permissions: permissions.map(({ companyId: _permissionCompanyId, roleId: _roleId, ...permission }) => permission),
    })),
    customColumns: Array.from({ length: 10 }, (_, index) => ({
      createdAt: stamp,
      dto: {
        id: fixtureId("16000000", index + 1),
        entityType: "contact" as const,
        label: `Synthetic column ${index + 1}`,
        type: "plain" as const,
      },
      updatedAt: stamp,
    })),
    contacts: Array.from({ length: 30 }, (_, index) => ({
      id: fixtureId("60000000", index + 1),
      firstName: `Contact ${index + 1}`,
      lastName: "Example",
      avatarUrl: SYNTHETIC_CONTACT_AVATAR_PATHS[index],
      notes: null,
      identifiers: [
        {
          id: fixtureId("b0000000", index + 1),
          provider: "mail" as const,
          value: `contact-${index + 1}@${
            index === 23 ? "asml.example" : [16, 22, 24].includes(index) ? "roche.example" : "example.com"
          }`,
          messagingId: null,
          displayName: null,
          profileUrl: null,
        },
      ],
      createdAt: stamp,
      updatedAt: stamp,
      organizations: [],
      users: [primaryUser],
      deals: [],
      tasks: [],
      customFieldValues: [],
    })),
    organizations: Array.from({ length: 19 }, (_, index) => ({
      id: fixtureId("70000000", index + 1),
      name: `Organization ${index + 1}`,
      notes: null,
      createdAt: stamp,
      updatedAt: stamp,
      contacts: [],
      users: [primaryUser],
      deals: [],
      tasks: [],
      customFieldValues: [
        {
          columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
          value: `https://organization-${index + 1}.example.com`,
        },
      ],
    })),
    services: Array.from({ length: 43 }, (_, index) => ({
      id: fixtureId("90000000", index + 1),
      name: `Service ${index + 1}`,
      amount: 1_000 + index,
      notes: null,
      createdAt: stamp,
      updatedAt: stamp,
      users: [primaryUser],
      deals: [],
      tasks: [],
      customFieldValues: [],
    })),
    deals: Array.from({ length: 10 }, (_, index) => ({
      id: fixtureId("80000000", index + 1),
      name: `Deal ${index + 1}`,
      totalQuantity: 1,
      totalValue: 10_000 + index,
      notes: null,
      createdAt: stamp,
      updatedAt: stamp,
      organizations: [],
      users: [primaryUser],
      contacts: [],
      services: [],
      tasks: [],
      customFieldValues: [],
    })),
    tasks: Array.from({ length: 15 }, (_, index) => ({
      id: fixtureId("a0000000", index + 1),
      name: `Task ${index + 1}`,
      type: "custom" as const,
      notes: null,
      createdAt: stamp,
      updatedAt: stamp,
      users: [primaryUser],
      contacts: [],
      organizations: [],
      deals: [],
      services: [],
      customFieldValues: [],
    })),
  };
}

function eventCounts(fixtures: SyntheticAuditFixture[]): Record<string, number> {
  return fixtures.reduce<Record<string, number>>((counts, fixture) => {
    counts[fixture.event] = (counts[fixture.event] ?? 0) + 1;
    return counts;
  }, {});
}

function auditPayload(fixture: SyntheticAuditFixture): Record<string, unknown> {
  return (fixture.eventData as unknown as { payload: Record<string, unknown> }).payload;
}

describe("synthetic audit-log fixtures", () => {
  it("builds the current-contract 225-row lifecycle with contact and messaging coverage", () => {
    const fixtures = buildSyntheticAuditLogFixtures({
      companyId: SEED_IDS.company,
      primaryUserId: SEED_IDS.user,
      snapshot: syntheticSnapshot(),
    });

    expect(fixtures).toHaveLength(SYNTHETIC_AUDIT_LOG_COUNT);
    expect(eventCounts(fixtures)).toEqual({
      [DomainEvent.USER_REGISTERED]: 3,
      [DomainEvent.USER_UPDATED]: 3,
      [DomainEvent.ROLE_CREATED]: 2,
      [DomainEvent.COMPANY_UPDATED]: 1,
      [DomainEvent.CUSTOM_COLUMN_CREATED]: 10,
      [DomainEvent.ORGANIZATION_CREATED]: 19,
      [DomainEvent.CONTACT_CREATED]: 30,
      [DomainEvent.SERVICE_CREATED]: 43,
      [DomainEvent.DEAL_CREATED]: 10,
      [DomainEvent.TASK_CREATED]: 15,
      [DomainEvent.CONTACT_UPDATED]: 9,
      [DomainEvent.ORGANIZATION_UPDATED]: 19,
      [DomainEvent.DEAL_UPDATED]: 10,
      [DomainEvent.SERVICE_UPDATED]: 5,
      [DomainEvent.TASK_UPDATED]: 15,
      [DomainEvent.CUSTOM_COLUMN_UPDATED]: 3,
      [DomainEvent.CONNECTED_ACCOUNT_CREATED]: 3,
      [DomainEvent.MESSAGING_CHAT_UPDATED]: 25,
    });
    expect(new Set(fixtures.map(({ id }) => id))).toHaveLength(SYNTHETIC_AUDIT_LOG_COUNT);
    expect(fixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_AUDIT_LOG_ID_PREFIX}-`))).toBe(true);
    expect(fixtures[0]?.createdAt).toEqual(new Date("2026-03-24T09:00:00.000Z"));
    expect(fixtures.at(-1)?.createdAt).toEqual(new Date("2026-03-29T01:00:00.000Z"));
    expect(
      buildSyntheticAuditLogFixtures({
        companyId: SEED_IDS.company,
        primaryUserId: SEED_IDS.user,
        snapshot: syntheticSnapshot(),
      }),
    ).toEqual(fixtures);

    const contactLogs = fixtures.filter(({ event }) => event === DomainEvent.CONTACT_CREATED);
    const expectedContactIds = new Set(Array.from({ length: 30 }, (_, index) => fixtureId("60000000", index + 1)));
    expect(new Set(contactLogs.map(({ entityId }) => entityId))).toEqual(expectedContactIds);

    const firstContactLog = contactLogs[0];
    expect(firstContactLog?.eventData).toMatchObject({
      companyId: SEED_IDS.company,
      entityId: fixtureId("60000000", 1),
      userId: SEED_IDS.user,
      payload: {
        id: fixtureId("60000000", 1),
        firstName: "Contact 1",
        lastName: "Example",
        identifiers: [
          expect.objectContaining({
            provider: "mail",
            value: "contact-1@example.com",
          }),
        ],
      },
    });
    expect(
      extractAuditChanges(firstContactLog?.event ?? "", firstContactLog?.eventData).map(({ field }) => field),
    ).toEqual(expect.arrayContaining(["firstName", "lastName", "identifiers", "users"]));

    const updatedContacts = fixtures.filter(({ event }) => event === DomainEvent.CONTACT_UPDATED);
    expect(updatedContacts.map(({ entityId }) => entityId)).toEqual(
      SYNTHETIC_CONTACT_UPDATE_INDEXES.map((index) => fixtureId("60000000", index + 1)),
    );
    for (const contactIndex of SYNTHETIC_CHAT_LINKED_CONTACT_INDEXES) {
      const update = updatedContacts.find(({ entityId }) => entityId === fixtureId("60000000", contactIndex + 1));
      expect(update).toBeDefined();
      expect(extractAuditChanges(update?.event ?? "", update?.eventData)).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "avatarUrl", previous: null })]),
      );
    }

    for (const contactIndex of [16, 22, 23, 24]) {
      const update = updatedContacts.find(({ entityId }) => entityId === fixtureId("60000000", contactIndex + 1));
      expect(extractAuditChanges(update?.event ?? "", update?.eventData)).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "identifiers" })]),
      );
    }

    const connectedAccounts = fixtures.filter(({ event }) => event === DomainEvent.CONNECTED_ACCOUNT_CREATED);
    expect(connectedAccounts.map(({ entityId }) => entityId)).toEqual([
      fixtureId("16000000", 1),
      fixtureId("16000000", 2),
      fixtureId("16000000", 3),
    ]);

    const messagingChatUpdates = fixtures.filter(({ event }) => event === DomainEvent.MESSAGING_CHAT_UPDATED);
    expect(messagingChatUpdates).toHaveLength(25);
    expect(messagingChatUpdates.map(({ entityId }) => entityId)).toEqual(
      Array.from({ length: 25 }, (_, index) => fixtureId("17000000", index + 1)),
    );
    expect(
      messagingChatUpdates.map(({ eventData, userId }) => ({
        eventData,
        userId,
      })),
    ).toEqual(
      messagingThreads.map((thread, index) => ({
        eventData: {
          companyId: SEED_IDS.company,
          entityId: fixtureId("17000000", index + 1),
          payload: {
            connectedAccountId: fixtureId(
              "16000000",
              thread.account === "google" ? 1 : thread.account === "linkedin" ? 2 : 3,
            ),
            provider: thread.account,
            providerThreadId: `demo-fixture-thread-${index + 1}`,
          },
          userId: null,
        },
        userId: SEED_IDS.user,
      })),
    );

    const userRegistrations = fixtures.filter(({ event }) => event === DomainEvent.USER_REGISTERED);
    expect(userRegistrations.map(auditPayload)).toEqual([
      expect.objectContaining({ firstName: "Max", lastName: "Mustermann" }),
      expect.objectContaining({ firstName: "Julia", lastName: "Weber" }),
      expect.objectContaining({
        firstName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
        lastName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
        roleId: null,
        status: "pendingAuthorization",
      }),
    ]);

    const userUpdates = fixtures.filter(({ event }) => event === DomainEvent.USER_UPDATED);
    expect(userUpdates.map(({ entityId }) => entityId)).toEqual([
      SEED_IDS.user,
      SEED_IDS.pendingUser,
      SEED_IDS.activeUser,
    ]);
    expect(userUpdates.map(auditPayload)).toEqual([
      expect.objectContaining({
        avatarUrl: primaryUser.avatarUrl,
        firstName: SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
        lastName: SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
      }),
      expect.objectContaining({
        avatarUrl: "/demo/avatars/photos/sofia-rossi.png",
        firstName: SYNTHETIC_COMPANY_USERS.sofiaRossi.firstName,
        lastName: SYNTHETIC_COMPANY_USERS.sofiaRossi.lastName,
      }),
      expect.objectContaining({
        avatarUrl: "/demo/avatars/photos/elena-hoffmann.png",
        firstName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
        lastName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
        roleId: SEED_IDS.customerSuccessRole,
        status: "active",
      }),
    ]);

    const roleCreations = fixtures.filter(({ event }) => event === DomainEvent.ROLE_CREATED);
    expect(roleCreations.map(({ entityId }) => entityId)).toEqual([
      SEED_IDS.salesManagerRole,
      SEED_IDS.customerSuccessRole,
    ]);
    expect(roleCreations.map(auditPayload)).toEqual([
      expect.objectContaining({ name: "Sales Manager", isSystemRole: false }),
      expect.objectContaining({
        name: "Customer Success",
        isSystemRole: false,
      }),
    ]);
    expect(
      roleCreations.find(({ entityId }) => entityId === SEED_IDS.customerSuccessRole)?.createdAt.getTime(),
    ).toBeLessThan(
      userUpdates.find(({ entityId }) => entityId === SEED_IDS.activeUser)?.createdAt.getTime() ??
        Number.NEGATIVE_INFINITY,
    );

    const firstOrganizationUpdate = fixtures.find(
      ({ entityId, event }) => entityId === fixtureId("70000000", 1) && event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(extractAuditChanges(firstOrganizationUpdate?.event ?? "", firstOrganizationUpdate?.eventData)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columnId: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
          current: "https://organization-1.example.com",
          field: "customFieldValues",
          previous: undefined,
        }),
      ]),
    );
  });

  it("keeps every update coherent with its creation state and deterministic lifecycle timestamps", () => {
    const fixtures = buildSyntheticAuditLogFixtures({
      companyId: SEED_IDS.company,
      primaryUserId: SEED_IDS.user,
      snapshot: syntheticSnapshot(),
    });
    const lifecycleDefinitions = [
      {
        createdEvent: DomainEvent.CONTACT_CREATED,
        updatedEvent: DomainEvent.CONTACT_UPDATED,
        entityKey: "contact",
      },
      {
        createdEvent: DomainEvent.ORGANIZATION_CREATED,
        updatedEvent: DomainEvent.ORGANIZATION_UPDATED,
        entityKey: "organization",
      },
      {
        createdEvent: DomainEvent.DEAL_CREATED,
        updatedEvent: DomainEvent.DEAL_UPDATED,
        entityKey: "deal",
      },
      {
        createdEvent: DomainEvent.SERVICE_CREATED,
        updatedEvent: DomainEvent.SERVICE_UPDATED,
        entityKey: "service",
      },
      {
        createdEvent: DomainEvent.TASK_CREATED,
        updatedEvent: DomainEvent.TASK_UPDATED,
        entityKey: "task",
      },
      {
        createdEvent: DomainEvent.CUSTOM_COLUMN_CREATED,
        updatedEvent: DomainEvent.CUSTOM_COLUMN_UPDATED,
        entityKey: "customColumn",
      },
    ] as const;

    for (const { createdEvent, updatedEvent, entityKey } of lifecycleDefinitions) {
      const creations = fixtures.filter(({ event }) => event === createdEvent);
      const updates = fixtures.filter(({ event }) => event === updatedEvent);

      for (const update of updates) {
        const creation = creations.find(({ entityId }) => entityId === update.entityId);
        expect(creation, `${updatedEvent} requires a matching creation event`).toBeDefined();
        if (!creation) continue;

        const initialState = auditPayload(creation);
        const updatePayload = auditPayload(update);
        const finalState = updatePayload[entityKey] as Record<string, unknown>;
        const changes = updatePayload.changes as Record<string, { current: unknown; previous: unknown }>;

        expect(update.createdAt.getTime()).toBeGreaterThan(creation.createdAt.getTime());
        for (const [field, change] of Object.entries(changes)) {
          expect(change.previous).not.toEqual(change.current);
          expect(initialState[field]).toEqual(change.previous);
          expect(finalState[field]).toEqual(change.current);
        }

        if ("createdAt" in initialState) {
          expect(initialState.createdAt).toBe(creation.createdAt.toISOString());
          expect(initialState.updatedAt).toBe(creation.createdAt.toISOString());
          expect(finalState.createdAt).toBe(creation.createdAt.toISOString());
          expect(finalState.updatedAt).toBe(update.createdAt.toISOString());
        }
      }
    }
  });

  it("upserts idempotently and removes only stale deterministic audit rows", async () => {
    const fixtures = buildSyntheticAuditLogFixtures({
      companyId: SEED_IDS.company,
      primaryUserId: SEED_IDS.user,
      snapshot: syntheticSnapshot(),
    });
    const rows = new Map<string, SyntheticAuditFixture | { id: string; companyId: string }>([
      ["unrelated-audit-row", { id: "unrelated-audit-row", companyId: SEED_IDS.company }],
      [
        fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, 999),
        {
          id: fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, 999),
          companyId: SEED_IDS.company,
        },
      ],
    ]);

    const prisma = {
      auditLog: {
        upsert: vi.fn((input: { create: SyntheticAuditFixture; where: { id: string } }) => {
          rows.set(input.where.id, input.create);
          return Promise.resolve(input.create);
        }),
        deleteMany: vi.fn(
          (input: {
            where: {
              companyId: string;
              id: { startsWith: string; notIn: string[] };
            };
          }) => {
            const keep = new Set(input.where.id.notIn);
            let count = 0;
            for (const [id, row] of rows) {
              if (row.companyId !== input.where.companyId || !id.startsWith(input.where.id.startsWith) || keep.has(id))
                continue;
              rows.delete(id);
              count += 1;
            }
            return Promise.resolve({ count });
          },
        ),
      },
    } as unknown as Pick<PrismaClient, "auditLog">;

    await persistSyntheticAuditLogFixtures(prisma, SEED_IDS.company, fixtures);
    await persistSyntheticAuditLogFixtures(prisma, SEED_IDS.company, fixtures);

    expect(rows).toHaveLength(SYNTHETIC_AUDIT_LOG_COUNT + 1);
    expect(rows.has("unrelated-audit-row")).toBe(true);
    expect(rows.has(fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, 999))).toBe(false);

    await persistSyntheticAuditLogFixtures(prisma, SEED_IDS.company, fixtures.slice(0, -1));
    expect(rows).toHaveLength(SYNTHETIC_AUDIT_LOG_COUNT);
    expect(rows.has(fixtures.at(-1)?.id ?? "")).toBe(false);
    expect(rows.has("unrelated-audit-row")).toBe(true);
  });
});
