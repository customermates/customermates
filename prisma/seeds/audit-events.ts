import type { DomainEventMap } from "@/features/event/domain-events";
import type { RoleDto } from "@/features/role/role.schema";
import type { WebhookDto } from "@/features/webhook/webhook.schema";
import type { Prisma, PrismaClient } from "@/generated/prisma";

import { calculateChanges } from "@/core/utils/calculate-changes";
import { DomainEvent } from "@/features/event/domain-events";
import { subjectKindOf } from "@/features/event/event-envelope";
import { RoleDtoSchema } from "@/features/role/role.schema";
import { toWebhookEventPayload } from "@/features/webhook/webhook-event-payload";
import { WebhookDtoSchema } from "@/features/webhook/webhook.schema";

import type { SeedContext } from "./context";

import { fixtureId } from "./helpers";
import { NORTHWIND_MEMBER_IDS, NORTHWIND_ROLE_IDS } from "./northwind-model";

export const SYNTHETIC_AUDIT_EVENT_ID_PREFIX = "1e000000";

type RegisteredUserSnapshot = {
  avatarUrl: string | null;
  country: DomainEventMap[DomainEvent.USER_REGISTERED]["payload"]["country"];
  createdAt: Date;
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  roleId: string | null;
  status: DomainEventMap[DomainEvent.USER_REGISTERED]["payload"]["status"];
  updatedAt: Date;
};

type ConnectedAccountSnapshot = {
  createdAt: Date;
  displayName: string | null;
  emailAddress: string | null;
  id: string;
  lastSyncedAt: Date | null;
  provider: DomainEventMap[DomainEvent.CONNECTED_ACCOUNT_CREATED]["payload"]["provider"];
};

export type SyntheticAuditSnapshot = {
  connectedAccounts: ConnectedAccountSnapshot[];
  roles: RoleDto[];
  users: RegisteredUserSnapshot[];
  webhooks: WebhookDto[];
};

export type SyntheticAuditFixture = {
  companyId: string;
  createdAt: Date;
  subjectKind: string;
  subjectId: string;
  kind: DomainEvent;
  payload: Prisma.InputJsonValue;
  id: string;
  actorId: string;
};

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assertSnapshotCount(label: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`Expected ${expected} ${label} audit snapshots, received ${actual}`);
}

function auditFixture<E extends DomainEvent>(args: {
  companyId: string;
  createdAt: Date;
  entityId: string;
  event: E;
  index: number;
  payload: DomainEventMap[E]["payload"];
  userId: string;
}): SyntheticAuditFixture {
  const { companyId, createdAt, entityId, event, index, payload, userId } = args;
  if (Number.isNaN(createdAt.getTime())) throw new Error(`Invalid timestamp for synthetic audit fixture ${index}`);

  return {
    id: fixtureId(SYNTHETIC_AUDIT_EVENT_ID_PREFIX, index),
    companyId,
    createdAt,
    subjectKind: subjectKindOf(event),
    subjectId: entityId,
    kind: event,
    payload: inputJson(payload),
    actorId: userId,
  };
}

function creationState<T extends { createdAt: Date; updatedAt: Date }>(entity: T, changes: Partial<T> = {}): T {
  return { ...entity, ...changes, updatedAt: entity.createdAt };
}

function updateState<T extends { createdAt: Date; updatedAt: Date }>(entity: T, changes: Partial<T> = {}): T {
  if (entity.updatedAt.getTime() <= entity.createdAt.getTime())
    throw new Error(`Synthetic update for ${"id" in entity ? String(entity.id) : "entity"} must follow its creation`);

  return { ...entity, ...changes };
}

export function buildSyntheticAuditEventFixtures(args: {
  companyId: string;
  primaryUserId: string;
  snapshot: SyntheticAuditSnapshot;
}): SyntheticAuditFixture[] {
  const { companyId, primaryUserId, snapshot } = args;
  const fixtures: SyntheticAuditFixture[] = [];
  const push = <E extends DomainEvent>(
    event: E,
    entityId: string,
    payload: DomainEventMap[E]["payload"],
    createdAt: Date,
    userId = primaryUserId,
  ) =>
    fixtures.push(
      auditFixture({
        companyId,
        createdAt,
        entityId,
        event,
        index: fixtures.length + 1,
        payload,
        userId,
      }),
    );

  const primaryUser = snapshot.users.find(({ id }) => id === primaryUserId);
  if (!primaryUser) throw new Error(`Missing primary synthetic user ${primaryUserId}`);

  push(
    DomainEvent.USER_REGISTERED,
    primaryUser.id,
    {
      avatarUrl: primaryUser.avatarUrl,
      country: primaryUser.country,
      email: primaryUser.email,
      firstName: primaryUser.firstName,
      isNewCompany: true,
      lastName: primaryUser.lastName,
      roleId: primaryUser.roleId,
      status: primaryUser.status,
    },
    primaryUser.createdAt,
    primaryUser.id,
  );

  for (const role of snapshot.roles) push(DomainEvent.ROLE_CREATED, role.id, role, role.createdAt);

  for (const user of snapshot.users.filter(({ id }) => id !== primaryUserId)) {
    const wasActivated = user.status === "active" && user.roleId !== null;
    push(
      DomainEvent.USER_REGISTERED,
      user.id,
      {
        avatarUrl: user.avatarUrl,
        country: user.country,
        email: user.email,
        firstName: user.firstName,
        isNewCompany: false,
        lastName: user.lastName,
        roleId: wasActivated ? null : user.roleId,
        status: wasActivated ? "pendingAuthorization" : user.status,
      },
      user.createdAt,
      user.id,
    );
    if (wasActivated) {
      if (!user.roleId) throw new Error(`Activated synthetic user ${user.id} requires a role`);
      push(
        DomainEvent.USER_UPDATED,
        user.id,
        {
          changes: {
            status: { previous: "pendingAuthorization", current: user.status },
            role: {
              previous: null,
              current: snapshot.roles.find((role) => role.id === user.roleId)?.name ?? null,
            },
          },
        },
        user.updatedAt,
      );
    }
  }

  for (const account of snapshot.connectedAccounts) {
    push(
      DomainEvent.CONNECTED_ACCOUNT_CREATED,
      account.id,
      {
        provider: account.provider,
        displayName: account.displayName,
        emailAddress: account.emailAddress,
      },
      account.createdAt,
    );
  }

  for (const webhook of snapshot.webhooks) {
    const createdWebhook = toWebhookEventPayload(creationState(webhook, { enabled: true }));
    push(DomainEvent.WEBHOOK_CREATED, createdWebhook.id, createdWebhook, createdWebhook.createdAt);
    if (webhook.enabled) continue;
    // The paused webhook was switched off after its receiver kept failing.
    const updatedWebhook = toWebhookEventPayload(updateState(webhook));
    push(
      DomainEvent.WEBHOOK_UPDATED,
      updatedWebhook.id,
      {
        webhook: updatedWebhook,
        changes: calculateChanges(createdWebhook, updatedWebhook),
      },
      updatedWebhook.updatedAt,
    );
  }

  return fixtures;
}

export async function persistSyntheticAuditEventFixtures(
  prisma: Pick<PrismaClient, "eventLog">,
  companyId: string,
  fixtures: SyntheticAuditFixture[],
): Promise<void> {
  for (const fixture of fixtures) {
    const { id, ...event } = fixture;
    const data = { ...event, deliveredAt: event.createdAt, nextAttemptAt: event.createdAt };
    await prisma.eventLog.upsert({
      where: { companyId_id: { companyId: event.companyId, id } },
      update: data,
      create: { id, ...data },
    });
  }

  await prisma.eventLog.deleteMany({
    where: {
      companyId,
      id: {
        startsWith: `${SYNTHETIC_AUDIT_EVENT_ID_PREFIX}-`,
        notIn: fixtures.map(({ id }) => id),
      },
    },
  });
}

async function loadSyntheticAuditSnapshot(prisma: PrismaClient, context: SeedContext): Promise<SyntheticAuditSnapshot> {
  const [users, roles, connectedAccounts, webhooks] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: {
          in: Object.values(NORTHWIND_MEMBER_IDS),
        },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        country: true,
        status: true,
        avatarUrl: true,
        roleId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.userRole.findMany({
      where: {
        id: {
          in: Object.values(NORTHWIND_ROLE_IDS).filter((id) => id !== NORTHWIND_ROLE_IDS.admin),
        },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        isSystemRole: true,
        createdAt: true,
        updatedAt: true,
        permissions: {
          orderBy: { id: "asc" },
          select: { id: true, resource: true, action: true },
        },
      },
    }),
    prisma.connectedAccount.findMany({
      where: {
        companyId: context.ids.company,
        id: {
          in: [fixtureId("16000000", 1), fixtureId("16000000", 2), fixtureId("16000000", 3)],
        },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        provider: true,
        displayName: true,
        emailAddress: true,
        createdAt: true,
        lastSyncedAt: true,
      },
    }),
    prisma.webhook.findMany({
      where: { id: { in: [fixtureId("22000000", 1), fixtureId("22000000", 2)] }, companyId: context.ids.company },
      orderBy: { id: "asc" },
      select: {
        id: true,
        url: true,
        description: true,
        events: true,
        secret: true,
        headers: true,
        bodyTemplate: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  assertSnapshotCount("users", users.length, Object.keys(NORTHWIND_MEMBER_IDS).length);
  assertSnapshotCount("roles", roles.length, Object.keys(NORTHWIND_ROLE_IDS).length - 1);
  assertSnapshotCount("webhooks", webhooks.length, 2);
  assertSnapshotCount("connected accounts", connectedAccounts.length, 3);

  return {
    connectedAccounts,
    users,
    roles: roles.map((role) => RoleDtoSchema.parse(role)),
    webhooks: webhooks.map((webhook) => WebhookDtoSchema.parse(webhook)),
  };
}

export async function seedSyntheticAuditEvents(context: SeedContext): Promise<void> {
  const snapshot = await loadSyntheticAuditSnapshot(context.prisma, context);
  const fixtures = buildSyntheticAuditEventFixtures({
    companyId: context.ids.company,
    primaryUserId: context.ids.user,
    snapshot,
  });
  await persistSyntheticAuditEventFixtures(context.prisma, context.ids.company, fixtures);
}
