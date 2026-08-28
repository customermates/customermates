import type { Prisma, PrismaClient } from "@/generated/prisma";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DealDto } from "@/features/deals/deal.schema";
import type { DomainEventMap } from "@/features/event/domain-events";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { RoleDto } from "@/features/role/role.schema";
import type { ServiceDto } from "@/features/services/service.schema";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { WebhookDto } from "@/features/webhook/webhook.schema";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";
import { DealDtoSchema } from "@/features/deals/deal.schema";
import { DomainEvent } from "@/features/event/domain-events";
import { OrganizationDtoSchema } from "@/features/organizations/organization.schema";
import { RoleDtoSchema } from "@/features/role/role.schema";
import { ServiceDtoSchema } from "@/features/services/service.schema";
import { TaskDtoSchema } from "@/features/tasks/task.schema";
import { WebhookDtoSchema } from "@/features/webhook/webhook.schema";
import { calculateChanges } from "@/core/utils/calculate-changes";

import type { SeedContext } from "./context";
import type { RelationshipSeedInput } from "./relationships";

import { SYNTHETIC_CUSTOM_COLUMN_IDS } from "./custom-fields";
import { dealSeedSelect } from "./deal-select";
import { fixtureId } from "./helpers";
import {
  SYNTHETIC_CONTACT_UPDATE_INDEXES,
  SYNTHETIC_DEAL_UPDATE_INDEXES,
  SYNTHETIC_ORGANIZATION_UPDATE_INDEXES,
  SYNTHETIC_TASK_UPDATE_INDEXES,
} from "./timeline";

export {
  SYNTHETIC_CONTACT_UPDATE_INDEXES,
  SYNTHETIC_DEAL_UPDATE_INDEXES,
  SYNTHETIC_ORGANIZATION_UPDATE_INDEXES,
  SYNTHETIC_TASK_UPDATE_INDEXES,
} from "./timeline";

export const SYNTHETIC_AUDIT_LOG_ID_PREFIX = "1e000000";

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

type CustomColumnSnapshot = {
  createdAt: Date;
  dto: CustomColumnDto;
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
  contacts: ContactDto[];
  customColumns: CustomColumnSnapshot[];
  deals: DealDto[];
  organizations: OrganizationDto[];
  roles: RoleDto[];
  services: ServiceDto[];
  tasks: TaskDto[];
  users: RegisteredUserSnapshot[];
  webhook: WebhookDto;
};

export type SyntheticAuditFixture = {
  companyId: string;
  createdAt: Date;
  entityId: string;
  event: DomainEvent;
  eventData: Prisma.InputJsonValue;
  id: string;
  userId: string;
};

const userReferenceSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  email: true,
} as const;

const contactReferenceSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} as const;

const organizationReferenceSelect = { id: true, name: true } as const;
const dealReferenceSelect = { id: true, name: true } as const;
const taskReferenceSelect = { id: true, name: true, type: true } as const;
const customFieldValueSelect = { columnId: true, value: true } as const;

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assertSnapshotCount(label: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`Expected ${expected} ${label} audit snapshots, received ${actual}`);
}

export const SYNTHETIC_PREVIOUS_ORGANIZATION_NAMES = new Map<number, string>([
  [5, "ASM Lithography"],
  [10, "PricewaterhouseCoopers"],
  [12, "NRW Bank"],
  [13, "Hoffmann-La Roche"],
]);

export const SYNTHETIC_PREVIOUS_CONTACT_FIRST_NAMES = new Map<number, string>([
  [0, "Leo"],
  [6, "Johannes"],
  [7, "Ayman"],
  [19, "Sophia"],
  [22, "Annika"],
  [23, "Jasmin"],
  [26, "Rachid"],
]);

export const SYNTHETIC_PREVIOUS_DEAL_NAMES = new Map<number, string>([
  [0, "Workflow Automation Program"],
  [1, "Business Intelligence Transformation"],
  [2, "CRM Implementation"],
]);

export const SYNTHETIC_PREVIOUS_TASK_NAMES = new Map<number, string>([
  [0, "Draft the Wavestone proposal"],
  [4, "Arrange a discovery call with BMW"],
  [7, "Follow up with Roche legal"],
  [8, "Arrange a discovery call with PwC"],
  [13, "Review notes from the Roche demo"],
]);

export const SYNTHETIC_RECENT_TASK_AUDIT_OFFSETS_MINUTES = {
  created: new Map<number, number>([
    [10, 156],
    [11, 126],
    [12, 66],
    [13, 96],
    [14, 12],
  ]),
  updated: new Map<number, number>([[13, 38]]),
} as const;

// Connected-account sync time is stable across reseeds, unlike Date.now(), and keeps these rows among recent messages.
function recentTaskAuditTime(
  messagingSyncAt: Date,
  phase: keyof typeof SYNTHETIC_RECENT_TASK_AUDIT_OFFSETS_MINUTES,
  taskIndex: number,
  fallback: Date,
): Date {
  const offsetMinutes = SYNTHETIC_RECENT_TASK_AUDIT_OFFSETS_MINUTES[phase].get(taskIndex);
  return offsetMinutes === undefined ? fallback : new Date(messagingSyncAt.getTime() - offsetMinutes * 60_000);
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
  const eventData = {
    companyId,
    entityId,
    payload,
    userId,
  } as DomainEventMap[E];

  return {
    id: fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, index),
    companyId,
    createdAt,
    entityId,
    event,
    eventData: inputJson(eventData),
    userId,
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

function assertDealTotals(deal: DealDto): void {
  const totalValue = deal.services.reduce((sum, service) => sum + service.amount * service.quantity, 0);
  const totalQuantity = deal.services.reduce((sum, service) => sum + service.quantity, 0);
  if (deal.totalValue !== totalValue || deal.totalQuantity !== totalQuantity) {
    throw new Error(
      `Deal ${deal.id} totals do not match its services: expected ${totalQuantity}/${totalValue}, received ${deal.totalQuantity}/${deal.totalValue}`,
    );
  }
}

export function buildSyntheticAuditLogFixtures(args: {
  companyId: string;
  primaryUserId: string;
  snapshot: SyntheticAuditSnapshot;
}): SyntheticAuditFixture[] {
  const { companyId, primaryUserId, snapshot } = args;
  const fixtures: SyntheticAuditFixture[] = [];
  const customColumnUpdates = [
    { index: 2, previousLabel: "Customer type" },
    { index: 5, previousLabel: "Deal status" },
    { index: 6, previousLabel: "Task status" },
  ] as const;
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
  const taskActorIds = [
    primaryUserId,
    ...snapshot.users
      .filter(({ id }) => id !== primaryUserId)
      .map(({ id }) => id)
      .sort(),
  ];
  const messagingSyncTimes = snapshot.connectedAccounts.flatMap(({ lastSyncedAt }) =>
    lastSyncedAt ? [lastSyncedAt.getTime()] : [],
  );
  if (messagingSyncTimes.length === 0) throw new Error("Missing synthetic messaging sync anchor for recent audit logs");
  const messagingSyncAt = new Date(Math.max(...messagingSyncTimes));
  const taskActorId = (taskIndex: number) => taskActorIds[taskIndex % taskActorIds.length];

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
          avatarUrl: user.avatarUrl,
          country: user.country,
          firstName: user.firstName,
          lastName: user.lastName,
          roleId: user.roleId,
          status: user.status,
        },
        user.updatedAt,
      );
    }
  }

  for (const [index, customColumn] of snapshot.customColumns.entries()) {
    const previousLabel = customColumnUpdates.find((update) => update.index === index)?.previousLabel;
    if (previousLabel === customColumn.dto.label)
      throw new Error(`Synthetic custom-column audit change at index ${index} must change the label`);

    const initialCustomColumn = previousLabel ? { ...customColumn.dto, label: previousLabel } : customColumn.dto;
    push(DomainEvent.CUSTOM_COLUMN_CREATED, customColumn.dto.id, initialCustomColumn, customColumn.createdAt);
  }

  for (const { index, previousLabel } of customColumnUpdates) {
    const customColumn = snapshot.customColumns[index];
    if (!customColumn) throw new Error(`Missing custom-column audit snapshot at index ${index}`);
    if (customColumn.updatedAt.getTime() <= customColumn.createdAt.getTime())
      throw new Error(`Custom column ${customColumn.dto.id} update must follow its creation`);
    push(
      DomainEvent.CUSTOM_COLUMN_UPDATED,
      customColumn.dto.id,
      {
        customColumn: customColumn.dto,
        changes: { label: { previous: previousLabel, current: customColumn.dto.label } },
      },
      customColumn.updatedAt,
    );
  }

  for (const organization of snapshot.organizations) {
    const organizationIndex = snapshot.organizations.indexOf(organization);
    const initialOrganization = creationState(organization, {
      contacts: [],
      deals: [],
      name: SYNTHETIC_PREVIOUS_ORGANIZATION_NAMES.get(organizationIndex) ?? organization.name,
      tasks: [],
    });
    push(DomainEvent.ORGANIZATION_CREATED, organization.id, initialOrganization, initialOrganization.createdAt);
  }

  for (const organizationIndex of SYNTHETIC_ORGANIZATION_UPDATE_INDEXES) {
    const organization = snapshot.organizations[organizationIndex];
    const previousName = SYNTHETIC_PREVIOUS_ORGANIZATION_NAMES.get(organizationIndex);
    if (!organization || !previousName) throw new Error(`Missing organization update snapshot ${organizationIndex}`);
    const updatedOrganization = updateState(organization, {
      contacts: [],
      deals: [],
      tasks: [],
    });
    push(
      DomainEvent.ORGANIZATION_UPDATED,
      organization.id,
      {
        organization: updatedOrganization,
        changes: { name: { previous: previousName, current: updatedOrganization.name } },
      },
      updatedOrganization.updatedAt,
    );
  }

  for (const [contactIndex, contact] of snapshot.contacts.entries()) {
    const initialContact = creationState(contact, {
      avatarUrl: null,
      deals: [],
      firstName: SYNTHETIC_PREVIOUS_CONTACT_FIRST_NAMES.get(contactIndex) ?? contact.firstName,
      tasks: [],
    });
    push(DomainEvent.CONTACT_CREATED, contact.id, initialContact, initialContact.createdAt);
  }
  for (const contactIndex of SYNTHETIC_CONTACT_UPDATE_INDEXES) {
    const contact = snapshot.contacts[contactIndex];
    const previousFirstName = SYNTHETIC_PREVIOUS_CONTACT_FIRST_NAMES.get(contactIndex);
    if (!contact || !previousFirstName) throw new Error(`Missing contact update snapshot ${contactIndex}`);
    const updatedContact = updateState(contact, { deals: [], tasks: [] });
    push(
      DomainEvent.CONTACT_UPDATED,
      contact.id,
      {
        contact: updatedContact,
        changes: { firstName: { previous: previousFirstName, current: updatedContact.firstName } },
      },
      updatedContact.updatedAt,
    );
  }

  for (const service of snapshot.services) {
    const initialService = creationState(service, { deals: [], tasks: [] });
    push(DomainEvent.SERVICE_CREATED, service.id, initialService, initialService.createdAt);
  }

  for (const [dealIndex, deal] of snapshot.deals.entries()) {
    assertDealTotals(deal);
    const initialDeal = creationState(deal, {
      name: SYNTHETIC_PREVIOUS_DEAL_NAMES.get(dealIndex) ?? deal.name,
      tasks: [],
    });
    push(DomainEvent.DEAL_CREATED, deal.id, initialDeal, initialDeal.createdAt);
  }

  for (const dealIndex of SYNTHETIC_DEAL_UPDATE_INDEXES) {
    const deal = snapshot.deals[dealIndex];
    const previousName = SYNTHETIC_PREVIOUS_DEAL_NAMES.get(dealIndex);
    if (!deal || !previousName) throw new Error(`Missing deal update snapshot ${dealIndex}`);
    const updatedDeal = updateState(deal, { tasks: [] });
    assertDealTotals(updatedDeal);
    push(
      DomainEvent.DEAL_UPDATED,
      deal.id,
      { deal: updatedDeal, changes: { name: { previous: previousName, current: updatedDeal.name } } },
      updatedDeal.updatedAt,
    );
  }

  for (const [taskIndex, task] of snapshot.tasks.entries()) {
    if (task.type !== "custom") continue;
    const initialTask = creationState(task, { name: SYNTHETIC_PREVIOUS_TASK_NAMES.get(taskIndex) ?? task.name });
    push(
      DomainEvent.TASK_CREATED,
      task.id,
      initialTask,
      recentTaskAuditTime(messagingSyncAt, "created", taskIndex, initialTask.createdAt),
      taskActorId(taskIndex),
    );
  }

  for (const taskIndex of SYNTHETIC_TASK_UPDATE_INDEXES) {
    const task = snapshot.tasks[taskIndex];
    const previousName = SYNTHETIC_PREVIOUS_TASK_NAMES.get(taskIndex);
    if (!task || task.type !== "custom" || !previousName) throw new Error(`Missing custom task update ${taskIndex}`);
    const updatedTask = updateState(task);
    push(
      DomainEvent.TASK_UPDATED,
      task.id,
      {
        task: updatedTask,
        changes: {
          name: {
            previous: previousName,
            current: updatedTask.name,
          },
        },
      },
      recentTaskAuditTime(messagingSyncAt, "updated", taskIndex, updatedTask.updatedAt),
      taskActorId(taskIndex),
    );
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

  const createdWebhook = creationState(snapshot.webhook, {
    description: null,
    enabled: true,
  });
  const updatedWebhook = updateState(snapshot.webhook);
  push(DomainEvent.WEBHOOK_CREATED, createdWebhook.id, createdWebhook, createdWebhook.createdAt);
  push(
    DomainEvent.WEBHOOK_UPDATED,
    updatedWebhook.id,
    {
      webhook: updatedWebhook,
      changes: calculateChanges(createdWebhook, updatedWebhook),
    },
    updatedWebhook.updatedAt,
  );

  return fixtures;
}

export async function persistSyntheticAuditLogFixtures(
  prisma: Pick<PrismaClient, "auditLog">,
  companyId: string,
  fixtures: SyntheticAuditFixture[],
): Promise<void> {
  for (const fixture of fixtures) {
    const { id, ...data } = fixture;
    await prisma.auditLog.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  await prisma.auditLog.deleteMany({
    where: {
      companyId,
      id: {
        startsWith: `${SYNTHETIC_AUDIT_LOG_ID_PREFIX}-`,
        notIn: fixtures.map(({ id }) => id),
      },
    },
  });
}

async function loadSyntheticAuditSnapshot(
  prisma: PrismaClient,
  entities: RelationshipSeedInput,
  context: SeedContext,
): Promise<SyntheticAuditSnapshot> {
  const [
    users,
    roles,
    customColumnRows,
    contactRows,
    organizationRows,
    dealRows,
    serviceRows,
    taskRows,
    connectedAccounts,
    webhook,
  ] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: {
          in: [context.ids.user, context.ids.sofiaRossiUser, context.ids.elenaHoffmannUser],
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
          in: [context.ids.salesManagerRole, context.ids.customerSuccessRole],
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
    prisma.customColumn.findMany({
      where: {
        id: { in: Object.values(SYNTHETIC_CUSTOM_COLUMN_IDS) },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        label: true,
        entityType: true,
        type: true,
        options: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.contact.findMany({
      where: {
        id: { in: entities.contacts.map(({ id }) => id) },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        identifiers: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            provider: true,
            value: true,
            messagingId: true,
            displayName: true,
            profileUrl: true,
          },
        },
        organizations: {
          select: { organization: { select: organizationReferenceSelect } },
        },
        users: { select: { user: { select: userReferenceSelect } } },
        deals: { select: { deal: { select: dealReferenceSelect } } },
        tasks: { select: { task: { select: taskReferenceSelect } } },
        customFieldValues: { select: customFieldValueSelect },
      },
    }),
    prisma.organization.findMany({
      where: {
        id: { in: entities.organizations.map(({ id }) => id) },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        contacts: { select: { contact: { select: contactReferenceSelect } } },
        users: { select: { user: { select: userReferenceSelect } } },
        deals: { select: { deal: { select: dealReferenceSelect } } },
        tasks: { select: { task: { select: taskReferenceSelect } } },
        customFieldValues: { select: customFieldValueSelect },
      },
    }),
    prisma.deal.findMany({
      where: {
        id: { in: entities.deals.map(({ id }) => id) },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: dealSeedSelect,
    }),
    prisma.service.findMany({
      where: {
        id: { in: entities.services.map(({ id }) => id) },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        amount: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        users: { select: { user: { select: userReferenceSelect } } },
        deals: { select: { deal: { select: dealReferenceSelect } } },
        tasks: { select: { task: { select: taskReferenceSelect } } },
        customFieldValues: { select: customFieldValueSelect },
      },
    }),
    prisma.task.findMany({
      where: {
        id: { in: entities.tasks.map(({ id }) => id) },
        companyId: context.ids.company,
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        users: { select: { user: { select: userReferenceSelect } } },
        contacts: { select: { contact: { select: contactReferenceSelect } } },
        organizations: {
          select: { organization: { select: organizationReferenceSelect } },
        },
        deals: { select: { deal: { select: dealReferenceSelect } } },
        services: {
          select: {
            service: { select: { id: true, name: true, amount: true } },
          },
        },
        customFieldValues: { select: customFieldValueSelect },
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
    prisma.webhook.findUniqueOrThrow({
      where: { id: fixtureId("22000000", 1), companyId: context.ids.company },
      select: {
        id: true,
        url: true,
        description: true,
        events: true,
        secret: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  assertSnapshotCount("users", users.length, 3);
  assertSnapshotCount("roles", roles.length, 2);
  assertSnapshotCount("custom columns", customColumnRows.length, Object.values(SYNTHETIC_CUSTOM_COLUMN_IDS).length);
  assertSnapshotCount("contacts", contactRows.length, entities.contacts.length);
  assertSnapshotCount("organizations", organizationRows.length, entities.organizations.length);
  assertSnapshotCount("deals", dealRows.length, entities.deals.length);
  assertSnapshotCount("services", serviceRows.length, entities.services.length);
  assertSnapshotCount("tasks", taskRows.length, entities.tasks.length);
  assertSnapshotCount("connected accounts", connectedAccounts.length, 3);

  return {
    connectedAccounts,
    users,
    roles: roles.map((role) => RoleDtoSchema.parse(role)),
    customColumns: customColumnRows.map(({ createdAt, updatedAt, ...customColumn }) => ({
      createdAt,
      dto: CustomColumnDtoSchema.parse(customColumn),
      updatedAt,
    })),
    contacts: contactRows.map((contact) =>
      ContactDtoSchema.parse({
        ...contact,
        organizations: contact.organizations.map(({ organization }) => organization),
        users: contact.users.map(({ user }) => user),
        deals: contact.deals.map(({ deal }) => deal),
        tasks: contact.tasks.map(({ task }) => task),
      }),
    ),
    organizations: organizationRows.map((organization) =>
      OrganizationDtoSchema.parse({
        ...organization,
        contacts: organization.contacts.map(({ contact }) => contact),
        users: organization.users.map(({ user }) => user),
        deals: organization.deals.map(({ deal }) => deal),
        tasks: organization.tasks.map(({ task }) => task),
      }),
    ),
    deals: dealRows.map((deal) =>
      DealDtoSchema.parse({
        ...deal,
        organizations: deal.organizations.map(({ organization }) => organization),
        users: deal.users.map(({ user }) => user),
        contacts: deal.contacts.map(({ contact }) => contact),
        services: deal.services.map(({ service, quantity }) => ({
          ...service,
          quantity,
        })),
        tasks: deal.tasks.map(({ task }) => task),
      }),
    ),
    services: serviceRows.map((service) =>
      ServiceDtoSchema.parse({
        ...service,
        users: service.users.map(({ user }) => user),
        deals: service.deals.map(({ deal }) => deal),
        tasks: service.tasks.map(({ task }) => task),
      }),
    ),
    tasks: taskRows.map((task) =>
      TaskDtoSchema.parse({
        ...task,
        users: task.users.map(({ user }) => user),
        contacts: task.contacts.map(({ contact }) => contact),
        organizations: task.organizations.map(({ organization }) => organization),
        deals: task.deals.map(({ deal }) => deal),
        services: task.services.map(({ service }) => service),
      }),
    ),
    webhook: WebhookDtoSchema.parse(webhook),
  };
}

export async function seedSyntheticAuditLogs(context: SeedContext, entities: RelationshipSeedInput): Promise<void> {
  const snapshot = await loadSyntheticAuditSnapshot(context.prisma, entities, context);
  const fixtures = buildSyntheticAuditLogFixtures({
    companyId: context.ids.company,
    primaryUserId: context.ids.user,
    snapshot,
  });
  await persistSyntheticAuditLogFixtures(context.prisma, context.ids.company, fixtures);
}
