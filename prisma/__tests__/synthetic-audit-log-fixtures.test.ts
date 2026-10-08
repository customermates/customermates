import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";
import { DomainEvent } from "@/features/event/domain-events";
import { subjectKindOf } from "@/features/event/event-envelope";

import {
  buildSyntheticAuditLogFixtures,
  persistSyntheticAuditLogFixtures,
  SYNTHETIC_AUDIT_LOG_ID_PREFIX,
  type SyntheticAuditFixture,
  type SyntheticAuditSnapshot,
} from "../seeds/audit-logs";
import { SEED_IDS } from "../seeds/context";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_CUSTOM_ROLES } from "../seeds/roles";
import { SYNTHETIC_SEED_TIMELINE, SYNTHETIC_TIMELINE_SHIFT_MS } from "../seeds/timeline";
import { SYNTHETIC_WEBHOOK_DESCRIPTION, SYNTHETIC_WEBHOOK_URL } from "../seeds/webhooks";

const primaryUserReference = {
  id: SEED_IDS.user,
  email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
  firstName: SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
  lastName: SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
  avatarUrl: "https://customermates.com/demo/avatars/photos/max-bergmann.png",
};
const messagingSyncAt = new Date(Date.parse("2026-08-06T00:00:00.000Z") + SYNTHETIC_TIMELINE_SHIFT_MS);

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

  return {
    connectedAccounts: ["google", "linkedin", "whatsapp"].map((provider, index) => ({
      id: fixtureId("16000000", index + 1),
      provider: provider as "google" | "linkedin" | "whatsapp",
      displayName: `Max Bergmann · ${provider}`,
      emailAddress: provider === "google" ? primaryUserReference.email : null,
      createdAt: SYNTHETIC_SEED_TIMELINE.connectedAccount(index).createdAt,
      lastSyncedAt: messagingSyncAt,
    })),
    users,
    roles: SYNTHETIC_CUSTOM_ROLES.map(({ companyId: _companyId, permissions, ...role }, index) => ({
      ...role,
      ...SYNTHETIC_SEED_TIMELINE.customRole(index),
      permissions: permissions.map(({ companyId: _permissionCompanyId, roleId: _roleId, ...permission }) => permission),
    })),
    webhook: {
      id: fixtureId("22000000", 1),
      url: SYNTHETIC_WEBHOOK_URL,
      description: SYNTHETIC_WEBHOOK_DESCRIPTION,
      events: ["record.created", "record.updated"],
      secret: null,
      headers: null,
      bodyTemplate: null,
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

function eventPayload(fixture: SyntheticAuditFixture): Record<string, unknown> {
  return fixture.payload as Record<string, unknown>;
}

function fixturesFor(fixtures: SyntheticAuditFixture[], event: DomainEvent): SyntheticAuditFixture[] {
  return fixtures.filter((fixture) => fixture.kind === event);
}

function fixtureForEntity(
  fixtures: SyntheticAuditFixture[],
  event: DomainEvent,
  entityId: string,
): SyntheticAuditFixture {
  const fixture = fixtures.find((candidate) => candidate.kind === event && candidate.subjectId === entityId);
  if (!fixture) throw new Error(`Missing ${event} fixture for ${entityId}`);
  return fixture;
}

describe("synthetic audit-log fixtures", () => {
  it("contains only system events EventService would persist and keeps the database actor honest", () => {
    const snapshot = syntheticSnapshot();
    const fixtures = buildFixtures(snapshot);
    const expectedCountsByEvent = {
      connectedAccountCreated: snapshot.connectedAccounts.length,
      roleCreated: snapshot.roles.length,
      userRegistered: snapshot.users.length,
      userUpdated: snapshot.users.filter(
        ({ id, roleId, status }) => id !== SEED_IDS.user && status === "active" && roleId !== null,
      ).length,
      webhookCreated: 1,
      webhookUpdated: 1,
    };
    const expectedAuditLogCount = Object.values(expectedCountsByEvent).reduce((total, count) => total + count, 0);

    expect(expectedAuditLogCount).toBe(12);
    expect(fixtures).toHaveLength(expectedAuditLogCount);
    expect(new Set(fixtures.map(({ id }) => id))).toHaveLength(fixtures.length);
    expect(fixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_AUDIT_LOG_ID_PREFIX}-`))).toBe(true);
    expect(fixtures.some(({ kind }) => kind.startsWith("messaging."))).toBe(false);
    expect(buildFixtures(snapshot)).toEqual(fixtures);
    expect(Math.max(...fixtures.map(({ createdAt }) => createdAt.getTime()))).toBeLessThan(messagingSyncAt.getTime());

    for (const fixture of fixtures) expect(fixture.subjectKind).toBe(subjectKindOf(fixture.kind));

    expect(fixturesFor(fixtures, DomainEvent.USER_REGISTERED)).toHaveLength(snapshot.users.length);
    expect(fixturesFor(fixtures, DomainEvent.ROLE_CREATED)).toHaveLength(snapshot.roles.length);
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

    expect(primaryRegistration).toMatchObject({ actorId: SEED_IDS.user });
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
    expect(updates.map(({ subjectId, actorId }) => ({ subjectId, actorId }))).toEqual([
      { subjectId: SEED_IDS.sofiaRossiUser, actorId: SEED_IDS.user },
      { subjectId: SEED_IDS.elenaHoffmannUser, actorId: SEED_IDS.user },
    ]);
    expect(eventPayload(fixtureForEntity(updates, DomainEvent.USER_UPDATED, SEED_IDS.sofiaRossiUser))).toEqual({
      changes: {
        status: { previous: "pendingAuthorization", current: "active" },
        role: { previous: null, current: "Sales Manager" },
      },
    });
    expect(eventPayload(fixtureForEntity(updates, DomainEvent.USER_UPDATED, SEED_IDS.elenaHoffmannUser))).toEqual({
      changes: {
        status: { previous: "pendingAuthorization", current: "active" },
        role: { previous: null, current: "Customer Success" },
      },
    });
  });

  it("records a real disabled-webhook lifecycle around its historical deliveries", () => {
    const fixtures = buildFixtures();
    const created = fixturesFor(fixtures, DomainEvent.WEBHOOK_CREATED)[0];
    const updated = fixturesFor(fixtures, DomainEvent.WEBHOOK_UPDATED)[0];

    expect(eventPayload(created)).toMatchObject({
      id: fixtureId("22000000", 1),
      enabled: true,
      description: null,
      hasSecret: false,
      headerNames: [],
    });
    expect(eventPayload(created)).not.toHaveProperty("secret");
    expect(eventPayload(created)).not.toHaveProperty("headers");
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
      eventLog: {
        upsert: vi.fn((input: { create: SyntheticAuditFixture; where: { companyId_id: { id: string } } }) => {
          rows.set(input.where.companyId_id.id, input.create);
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
    } as unknown as Pick<PrismaClient, "eventLog">;

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
