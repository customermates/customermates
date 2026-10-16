import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";
import { DomainEvent } from "@/features/event/domain-events";
import { subjectKindOf } from "@/features/event/event-envelope";

import {
  buildSyntheticAuditEventFixtures,
  persistSyntheticAuditEventFixtures,
  SYNTHETIC_AUDIT_EVENT_ID_PREFIX,
  type SyntheticAuditFixture,
  type SyntheticAuditSnapshot,
} from "../seeds/audit-events";
import { SEED_IDS } from "../seeds/context";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_CUSTOM_ROLES } from "../seeds/roles";
import { SYNTHETIC_SEED_TIMELINE, SYNTHETIC_TIMELINE_SHIFT_MS } from "../seeds/timeline";
import { SYNTHETIC_COMPANY_MEMBER_DEFINITIONS } from "../seeds/members";
import { NORTHWIND_STORY_END_MS, northwindAt, northwindMemberJoinedMs } from "../seeds/northwind-data";
import { NORTHWIND_MEMBER_IDS } from "../seeds/northwind-model";
import {
  SYNTHETIC_PAUSED_WEBHOOK_DESCRIPTION,
  SYNTHETIC_PAUSED_WEBHOOK_ID,
  SYNTHETIC_PAUSED_WEBHOOK_URL,
  SYNTHETIC_WEBHOOK_DESCRIPTION,
  SYNTHETIC_WEBHOOK_ID,
  SYNTHETIC_WEBHOOK_URL,
} from "../seeds/webhooks";

const messagingSyncAt = new Date(Date.parse("2026-08-06T00:00:00.000Z") + SYNTHETIC_TIMELINE_SHIFT_MS);
const DAY = 86_400_000;
const memberKeys = Object.keys(NORTHWIND_MEMBER_IDS) as Array<keyof typeof NORTHWIND_MEMBER_IDS>;

function syntheticSnapshot(): SyntheticAuditSnapshot {
  const users = SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map((member, index) => {
    const createdAt = northwindAt(northwindMemberJoinedMs(memberKeys[index]));
    return {
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      avatarUrl: member.avatarPath,
      country: member.country,
      roleId: member.roleId,
      status: member.status,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 30 * 60_000),
    };
  });
  const webhook = (id: string, url: string, description: string, enabled: boolean, createdDaysAgo: number) => ({
    id,
    url,
    description,
    events: ["record.created", "record.updated"] as Array<"record.created" | "record.updated">,
    secret: null,
    headers: null,
    bodyTemplate: null,
    enabled,
    createdAt: northwindAt(NORTHWIND_STORY_END_MS - createdDaysAgo * DAY),
    updatedAt: northwindAt(NORTHWIND_STORY_END_MS - (enabled ? createdDaysAgo : 2) * DAY),
  });

  return {
    connectedAccounts: ["google", "linkedin", "whatsapp"].map((provider, index) => ({
      id: fixtureId("16000000", index + 1),
      provider: provider as "google" | "linkedin" | "whatsapp",
      displayName: `Max Bergmann · ${provider}`,
      emailAddress: provider === "google" ? SYNTHETIC_COMPANY_USERS.maxBergmann.email : null,
      createdAt: SYNTHETIC_SEED_TIMELINE.connectedAccount(index).createdAt,
      lastSyncedAt: messagingSyncAt,
    })),
    users,
    roles: SYNTHETIC_CUSTOM_ROLES.map(
      ({ companyId: _companyId, permissions, recordGrants: _grants, ...role }, index) => ({
        ...role,
        ...SYNTHETIC_SEED_TIMELINE.customRole(index),
        permissions: permissions.map(
          ({ companyId: _permissionCompanyId, roleId: _roleId, ...permission }) => permission,
        ),
      }),
    ),
    webhooks: [
      webhook(SYNTHETIC_WEBHOOK_ID, SYNTHETIC_WEBHOOK_URL, SYNTHETIC_WEBHOOK_DESCRIPTION, true, 210),
      webhook(
        SYNTHETIC_PAUSED_WEBHOOK_ID,
        SYNTHETIC_PAUSED_WEBHOOK_URL,
        SYNTHETIC_PAUSED_WEBHOOK_DESCRIPTION,
        false,
        120,
      ),
    ],
  };
}

function buildFixtures(snapshot = syntheticSnapshot()): SyntheticAuditFixture[] {
  return buildSyntheticAuditEventFixtures({
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

describe("synthetic audit event fixtures", () => {
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
      webhookCreated: 2,
      webhookUpdated: 1,
    };
    const expectedAuditEventCount = Object.values(expectedCountsByEvent).reduce((total, count) => total + count, 0);

    expect(expectedAuditEventCount).toBe(24);
    expect(fixtures).toHaveLength(expectedAuditEventCount);
    expect(new Set(fixtures.map(({ id }) => id))).toHaveLength(fixtures.length);
    expect(fixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_AUDIT_EVENT_ID_PREFIX}-`))).toBe(true);
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
    const invitedRegistration = fixtureForEntity(registrations, DomainEvent.USER_REGISTERED, SEED_IDS.sofiaRossiUser);

    expect(primaryRegistration).toMatchObject({ actorId: SEED_IDS.user });
    expect(eventPayload(primaryRegistration)).toMatchObject({
      isNewCompany: true,
      status: "active",
      roleId: SEED_IDS.role,
    });
    expect(eventPayload(invitedRegistration)).toMatchObject({
      isNewCompany: false,
      status: "pendingAuthorization",
      roleId: null,
    });
    expect(updates.map(({ subjectId, actorId }) => ({ subjectId, actorId }))).toEqual(
      SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.slice(1).map(({ id }) => ({ subjectId: id, actorId: SEED_IDS.user })),
    );
    expect(eventPayload(fixtureForEntity(updates, DomainEvent.USER_UPDATED, SEED_IDS.sofiaRossiUser))).toEqual({
      changes: {
        status: { previous: "pendingAuthorization", current: "active" },
        role: { previous: null, current: "Sales lead" },
      },
    });
    expect(eventPayload(fixtureForEntity(updates, DomainEvent.USER_UPDATED, NORTHWIND_MEMBER_IDS.kianRahimi))).toEqual({
      changes: {
        status: { previous: "pendingAuthorization", current: "active" },
        role: { previous: null, current: "Support" },
      },
    });
  });

  it("records both webhooks, and pausing the one whose receiver kept failing", () => {
    const fixtures = buildFixtures();
    const created = fixturesFor(fixtures, DomainEvent.WEBHOOK_CREATED);
    const updated = fixturesFor(fixtures, DomainEvent.WEBHOOK_UPDATED);

    expect(created.map(({ subjectId }) => subjectId)).toEqual([SYNTHETIC_WEBHOOK_ID, SYNTHETIC_PAUSED_WEBHOOK_ID]);
    for (const fixture of created) {
      expect(eventPayload(fixture)).toMatchObject({ enabled: true, hasSecret: false, headerNames: [] });
      expect(eventPayload(fixture)).not.toHaveProperty("secret");
    }
    expect(updated).toHaveLength(1);
    expect(eventPayload(updated[0])).toMatchObject({
      webhook: { id: SYNTHETIC_PAUSED_WEBHOOK_ID, enabled: false, url: SYNTHETIC_PAUSED_WEBHOOK_URL },
      changes: { enabled: { previous: true, current: false } },
    });
    expect(updated[0]?.createdAt.getTime()).toBeGreaterThan(created[1]?.createdAt.getTime() ?? Infinity);
  });

  it("upserts idempotently and removes only stale deterministic audit rows", async () => {
    const fixtures = buildFixtures();
    const rows = new Map<string, SyntheticAuditFixture | { id: string; companyId: string }>([
      ["unrelated-audit-row", { id: "unrelated-audit-row", companyId: SEED_IDS.company }],
      [
        fixtureId(SYNTHETIC_AUDIT_EVENT_ID_PREFIX, 999),
        { id: fixtureId(SYNTHETIC_AUDIT_EVENT_ID_PREFIX, 999), companyId: SEED_IDS.company },
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

    await persistSyntheticAuditEventFixtures(prisma, SEED_IDS.company, fixtures);
    await persistSyntheticAuditEventFixtures(prisma, SEED_IDS.company, fixtures);

    expect(rows).toHaveLength(fixtures.length + 1);
    expect(rows.has("unrelated-audit-row")).toBe(true);
    expect(rows.has(fixtureId(SYNTHETIC_AUDIT_EVENT_ID_PREFIX, 999))).toBe(false);

    await persistSyntheticAuditEventFixtures(prisma, SEED_IDS.company, fixtures.slice(0, -1));
    expect(rows).toHaveLength(fixtures.length);
    expect(rows.has(fixtures.at(-1)?.id ?? "")).toBe(false);
    expect(rows.has("unrelated-audit-row")).toBe(true);
  });
});
