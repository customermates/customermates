import type { Prisma, PrismaClient } from "@/generated/prisma";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DealDto } from "@/features/deals/deal.schema";
import type { DomainEventMap } from "@/features/event/domain-events";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { UserRoleDto } from "@/features/role/role.types";
import type { ServiceDto } from "@/features/services/service.schema";
import type { TaskDto } from "@/features/tasks/task.schema";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";
import { DealDtoSchema } from "@/features/deals/deal.schema";
import { DomainEvent } from "@/features/event/domain-events";
import { OrganizationDtoSchema } from "@/features/organizations/organization.schema";
import { RoleDtoSchema } from "@/features/role/role.schema";
import { ServiceDtoSchema } from "@/features/services/service.schema";
import { TaskDtoSchema } from "@/features/tasks/task.schema";

import type { SeedContext } from "./context";
import type { RelationshipSeedInput } from "./relationships";

import { SYNTHETIC_CUSTOM_COLUMN_IDS } from "./custom-fields";
import { fixtureId } from "./helpers";
import { threads as messagingThreads } from "./messaging/fixtures";

export const SYNTHETIC_AUDIT_LOG_COUNT = 225;
export const SYNTHETIC_AUDIT_LOG_ID_PREFIX = "1e000000";
export const SYNTHETIC_CONTACT_UPDATE_INDEXES = [0, 6, 7, 16, 19, 22, 23, 24, 26] as const;
export const SYNTHETIC_CHAT_LINKED_CONTACT_INDEXES = [0, 6, 7, 19, 22, 23, 26] as const;

const AUDIT_TIMELINE_START = Date.parse("2026-03-24T09:00:00.000Z");
const AUDIT_TIMELINE_STEP = 30 * 60_000;

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
  provider: DomainEventMap[DomainEvent.CONNECTED_ACCOUNT_CREATED]["payload"]["provider"];
};

export type SyntheticAuditSnapshot = {
  company: {
    currency: DomainEventMap[DomainEvent.COMPANY_UPDATED]["payload"]["currency"];
    updatedAt: Date;
  };
  connectedAccounts: ConnectedAccountSnapshot[];
  contacts: ContactDto[];
  customColumns: CustomColumnSnapshot[];
  deals: DealDto[];
  organizations: OrganizationDto[];
  roles: UserRoleDto[];
  services: ServiceDto[];
  tasks: TaskDto[];
  users: RegisteredUserSnapshot[];
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

function deterministicAuditTimestamp(index: number, sourceTimestamp: Date): Date {
  if (Number.isNaN(sourceTimestamp.getTime())) throw new Error(`Invalid source timestamp for audit fixture ${index}`);
  return auditTimelineTimestamp(index);
}

function auditTimelineTimestamp(index: number): Date {
  return new Date(AUDIT_TIMELINE_START + (index - 1) * AUDIT_TIMELINE_STEP);
}

function previousLowerValue(current: number, label: string): number {
  if (!Number.isFinite(current) || current <= 0)
    throw new Error(`Expected a positive ${label} for a meaningful synthetic audit change, received ${current}`);

  return Math.max(0, current - Math.max(1, Math.round(current * 0.1)));
}

function previousOrganizationName(current: string): string {
  const previousNames: Record<string, string> = {
    ASML: "SAP",
    PwC: "PWC",
    "NRW.BANK": "NRW Bank",
    Roche: "Bayer",
  };
  return previousNames[current] ?? `Legacy ${current}`;
}

function previousTaskName(current: string): string {
  const previousNames: Record<string, string> = {
    "Prepare and send a proposal for Wavestone": "Prepare and send a proposal for Contoso",
    "Schedule discovery call with BMW": "Schedule discovery call with Contoso",
    "User Pending Authorization (Sofia Rossi)": "User Pending Authorization (Julia Weber)",
    "Follow up with legal on contract approval for Roche": "Follow up with legal on contract approval for Globex",
    "Schedule discovery call with PwC": "Schedule discovery call with Contoso",
    "Review follow-up notes from the Roche demo": "Follow up with John Doe from Acme Corp after demo",
  };
  return previousNames[current] ?? `Legacy ${current}`;
}

const contactIdentifierDomainChanges = new Map<number, { current: string; previous: string }>([
  [16, { current: "roche.example", previous: "bayer.example" }],
  [22, { current: "roche.example", previous: "bayer.example" }],
  [23, { current: "asml.example", previous: "sap.example" }],
  [24, { current: "roche.example", previous: "bayer.example" }],
]);

function previousContactIdentifiers(contact: ContactDto, contactIndex: number): ContactDto["identifiers"] {
  const domains = contactIdentifierDomainChanges.get(contactIndex);
  if (!domains) return contact.identifiers;

  let changed = false;
  const identifiers = contact.identifiers.map((identifier) => {
    const suffix = `@${domains.current}`;
    if (identifier.provider !== "mail" || !identifier.value.endsWith(suffix)) return identifier;

    changed = true;
    return {
      ...identifier,
      value: `${identifier.value.slice(0, -suffix.length)}@${domains.previous}`,
    };
  });

  if (!changed) throw new Error(`Contact ${contact.id} requires the expected synthetic email-domain audit change`);
  return identifiers;
}

function auditFixture<E extends DomainEvent>(args: {
  companyId: string;
  createdAt: Date;
  entityId: string;
  event: E;
  eventUserId?: DomainEventMap[E]["userId"];
  index: number;
  payload: DomainEventMap[E]["payload"];
  userId: string;
}): SyntheticAuditFixture {
  const { companyId, createdAt, entityId, event, eventUserId, index, payload, userId } = args;
  const eventData = {
    companyId,
    entityId,
    payload,
    userId: eventUserId === undefined ? userId : eventUserId,
  } as DomainEventMap[E];

  return {
    id: fixtureId(SYNTHETIC_AUDIT_LOG_ID_PREFIX, index),
    companyId,
    createdAt: deterministicAuditTimestamp(index, createdAt),
    entityId,
    event,
    eventData: inputJson(eventData),
    userId,
  };
}

export function buildSyntheticAuditLogFixtures(args: {
  companyId: string;
  primaryUserId: string;
  snapshot: SyntheticAuditSnapshot;
}): SyntheticAuditFixture[] {
  const { companyId, primaryUserId, snapshot } = args;
  const fixtures: SyntheticAuditFixture[] = [];
  const entityCreationTimestamps = new Map<string, Date>();
  const chatLinkedContactIndexes = new Set<number>(SYNTHETIC_CHAT_LINKED_CONTACT_INDEXES);
  const contactUpdateIndexes = new Set<number>(SYNTHETIC_CONTACT_UPDATE_INDEXES);
  const customColumnUpdates = [
    { index: 2, previousLabel: "Customer type" },
    { index: 5, previousLabel: "Deal status" },
    { index: 6, previousLabel: "Task status" },
  ] as const;
  const nextTimelineTimestamp = () => auditTimelineTimestamp(fixtures.length + 1);
  const creationState = <T extends { id: string; createdAt: Date; updatedAt: Date }>(
    entity: T,
    changes: Partial<T> = {},
  ): T => {
    const createdAt = nextTimelineTimestamp();
    entityCreationTimestamps.set(entity.id, createdAt);
    return { ...entity, ...changes, createdAt, updatedAt: createdAt };
  };
  const updateState = <T extends { id: string; createdAt: Date; updatedAt: Date }>(entity: T): T => {
    const createdAt = entityCreationTimestamps.get(entity.id);
    if (!createdAt) throw new Error(`Missing synthetic creation timestamp for ${entity.id}`);
    return { ...entity, createdAt, updatedAt: nextTimelineTimestamp() };
  };
  const push = <E extends DomainEvent>(
    event: E,
    entityId: string,
    payload: DomainEventMap[E]["payload"],
    createdAt: Date,
    userId = primaryUserId,
    eventUserId?: DomainEventMap[E]["userId"],
  ) =>
    fixtures.push(
      auditFixture({
        companyId,
        createdAt,
        entityId,
        event,
        eventUserId,
        index: fixtures.length + 1,
        payload,
        userId,
      }),
    );

  for (const user of snapshot.users) {
    const isPrimaryUser = user.id === primaryUserId;
    const isActivatedCustomMember = !isPrimaryUser && user.status === "active" && user.roleId !== null;
    const previousName = isPrimaryUser
      ? { firstName: "Max", lastName: "Mustermann" }
      : isActivatedCustomMember
        ? { firstName: user.firstName, lastName: user.lastName }
        : { firstName: "Julia", lastName: "Weber" };
    push(
      DomainEvent.USER_REGISTERED,
      user.id,
      {
        avatarUrl: null,
        country: user.country,
        email: user.email,
        firstName: previousName.firstName,
        isNewCompany: isPrimaryUser,
        lastName: previousName.lastName,
        roleId: isActivatedCustomMember ? null : user.roleId,
        status: isActivatedCustomMember ? "pendingAuthorization" : user.status,
      },
      nextTimelineTimestamp(),
      user.id,
    );
  }

  for (const role of snapshot.roles) {
    const createdRole = creationState(role);
    push(DomainEvent.ROLE_CREATED, role.id, createdRole, createdRole.createdAt);
  }

  for (const user of snapshot.users) {
    push(
      DomainEvent.USER_UPDATED,
      user.id,
      {
        avatarUrl: user.avatarUrl,
        country: user.country,
        firstName: user.firstName,
        lastName: user.lastName,
        ...(user.roleId ? { roleId: user.roleId } : {}),
        status: user.status,
      },
      nextTimelineTimestamp(),
    );
  }

  push(DomainEvent.COMPANY_UPDATED, companyId, { currency: snapshot.company.currency }, nextTimelineTimestamp());

  for (const [index, customColumn] of snapshot.customColumns.entries()) {
    const previousLabel = customColumnUpdates.find((update) => update.index === index)?.previousLabel;
    if (previousLabel === customColumn.dto.label)
      throw new Error(`Synthetic custom-column audit change at index ${index} must change the label`);

    const initialCustomColumn = previousLabel ? { ...customColumn.dto, label: previousLabel } : customColumn.dto;
    push(DomainEvent.CUSTOM_COLUMN_CREATED, customColumn.dto.id, initialCustomColumn, nextTimelineTimestamp());
  }

  for (const organization of snapshot.organizations) {
    const initialCustomFieldValues = organization.customFieldValues.filter(
      ({ columnId }) => columnId !== SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
    );
    if (initialCustomFieldValues.length === organization.customFieldValues.length)
      throw new Error(`Organization ${organization.id} requires a Website custom field for its audit change`);

    const initialOrganization = creationState(organization, {
      customFieldValues: initialCustomFieldValues,
      name: previousOrganizationName(organization.name),
    });
    push(DomainEvent.ORGANIZATION_CREATED, organization.id, initialOrganization, initialOrganization.createdAt);
  }

  for (const [contactIndex, contact] of snapshot.contacts.entries()) {
    const isChatLinked = chatLinkedContactIndexes.has(contactIndex);
    const hasIdentifierChange = contactIdentifierDomainChanges.has(contactIndex);
    const isRenamed = contactUpdateIndexes.has(contactIndex) && !isChatLinked && !hasIdentifierChange;
    if (isChatLinked && !contact.avatarUrl)
      throw new Error(`Chat-linked contact at index ${contactIndex} requires an avatar for its audit change`);

    const initialContact = creationState(contact, {
      ...(isChatLinked ? { avatarUrl: null } : {}),
      ...(hasIdentifierChange ? { identifiers: previousContactIdentifiers(contact, contactIndex) } : {}),
      ...(isRenamed ? { firstName: `Legacy ${contact.firstName}` } : {}),
    });
    push(DomainEvent.CONTACT_CREATED, contact.id, initialContact, initialContact.createdAt);
  }

  for (const [serviceIndex, service] of snapshot.services.entries()) {
    const initialService = creationState(service, {
      amount: serviceIndex < 5 ? previousLowerValue(service.amount, "service amount") : service.amount,
    });
    push(DomainEvent.SERVICE_CREATED, service.id, initialService, initialService.createdAt);
  }

  for (const deal of snapshot.deals) {
    const initialDeal = creationState(deal, {
      totalValue: previousLowerValue(deal.totalValue, "deal total value"),
    });
    push(DomainEvent.DEAL_CREATED, deal.id, initialDeal, initialDeal.createdAt);
  }

  for (const task of snapshot.tasks) {
    const initialTask = creationState(task, {
      name: previousTaskName(task.name),
    });
    push(DomainEvent.TASK_CREATED, task.id, initialTask, initialTask.createdAt);
  }

  for (const contactIndex of SYNTHETIC_CONTACT_UPDATE_INDEXES) {
    const contact = snapshot.contacts[contactIndex];
    if (!contact) throw new Error(`Missing contact audit snapshot at index ${contactIndex}`);
    const updatedContact = updateState(contact);

    const changes: Record<string, { previous: unknown; current: unknown }> = {};
    if (chatLinkedContactIndexes.has(contactIndex))
      changes.avatarUrl = { previous: null, current: updatedContact.avatarUrl };
    if (contactIdentifierDomainChanges.has(contactIndex)) {
      changes.identifiers = {
        previous: previousContactIdentifiers(updatedContact, contactIndex),
        current: updatedContact.identifiers,
      };
    }
    if (!chatLinkedContactIndexes.has(contactIndex) && !contactIdentifierDomainChanges.has(contactIndex)) {
      changes.firstName = {
        previous: `Legacy ${updatedContact.firstName}`,
        current: updatedContact.firstName,
      };
    }

    push(DomainEvent.CONTACT_UPDATED, contact.id, { contact: updatedContact, changes }, updatedContact.updatedAt);
  }

  for (const organization of snapshot.organizations) {
    const updatedOrganization = updateState(organization);
    const previousCustomFieldValues = updatedOrganization.customFieldValues.filter(
      ({ columnId }) => columnId !== SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
    );
    push(
      DomainEvent.ORGANIZATION_UPDATED,
      organization.id,
      {
        organization: updatedOrganization,
        changes: {
          name: {
            previous: previousOrganizationName(updatedOrganization.name),
            current: updatedOrganization.name,
          },
          customFieldValues: {
            previous: previousCustomFieldValues,
            current: updatedOrganization.customFieldValues,
          },
        },
      },
      updatedOrganization.updatedAt,
    );
  }

  for (const deal of snapshot.deals) {
    const updatedDeal = updateState(deal);
    push(
      DomainEvent.DEAL_UPDATED,
      deal.id,
      {
        deal: updatedDeal,
        changes: {
          totalValue: {
            previous: previousLowerValue(updatedDeal.totalValue, "deal total value"),
            current: updatedDeal.totalValue,
          },
        },
      },
      updatedDeal.updatedAt,
    );
  }

  for (const service of snapshot.services.slice(0, 5)) {
    const updatedService = updateState(service);
    push(
      DomainEvent.SERVICE_UPDATED,
      service.id,
      {
        service: updatedService,
        changes: {
          amount: {
            previous: previousLowerValue(updatedService.amount, "service amount"),
            current: updatedService.amount,
          },
        },
      },
      updatedService.updatedAt,
    );
  }

  for (const task of snapshot.tasks) {
    const updatedTask = updateState(task);
    push(
      DomainEvent.TASK_UPDATED,
      task.id,
      {
        task: updatedTask,
        changes: {
          name: {
            previous: previousTaskName(updatedTask.name),
            current: updatedTask.name,
          },
        },
      },
      updatedTask.updatedAt,
    );
  }

  for (const { index, previousLabel } of customColumnUpdates) {
    const customColumn = snapshot.customColumns[index];
    if (!customColumn) throw new Error(`Missing custom-column audit snapshot at index ${index}`);
    push(
      DomainEvent.CUSTOM_COLUMN_UPDATED,
      customColumn.dto.id,
      {
        customColumn: customColumn.dto,
        changes: {
          label: { previous: previousLabel, current: customColumn.dto.label },
        },
      },
      nextTimelineTimestamp(),
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
      nextTimelineTimestamp(),
    );
  }

  if (messagingThreads.length !== 25)
    throw new Error(`Expected 25 synthetic messaging threads, received ${messagingThreads.length}`);

  for (const [threadIndex, thread] of messagingThreads.entries()) {
    const connectedAccount = snapshot.connectedAccounts.find(({ provider }) => provider === thread.account);
    if (!connectedAccount)
      throw new Error(`Missing ${thread.account} connected account for synthetic messaging audit fixture`);

    push(
      DomainEvent.MESSAGING_CHAT_UPDATED,
      fixtureId("17000000", threadIndex + 1),
      {
        connectedAccountId: connectedAccount.id,
        provider: connectedAccount.provider,
        providerThreadId: `demo-fixture-thread-${threadIndex + 1}`,
      },
      nextTimelineTimestamp(),
      primaryUserId,
      null,
    );
  }

  if (fixtures.length !== SYNTHETIC_AUDIT_LOG_COUNT)
    throw new Error(`Expected ${SYNTHETIC_AUDIT_LOG_COUNT} synthetic audit fixtures, received ${fixtures.length}`);

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
    company,
    users,
    roles,
    customColumnRows,
    contactRows,
    organizationRows,
    dealRows,
    serviceRows,
    taskRows,
    connectedAccounts,
  ] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: context.ids.company },
      select: { currency: true, updatedAt: true },
    }),
    prisma.user.findMany({
      where: {
        id: {
          in: [context.ids.user, context.ids.pendingUser, context.ids.activeUser],
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
      select: {
        id: true,
        name: true,
        totalValue: true,
        totalQuantity: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        organizations: {
          select: { organization: { select: organizationReferenceSelect } },
        },
        users: { select: { user: { select: userReferenceSelect } } },
        contacts: { select: { contact: { select: contactReferenceSelect } } },
        services: {
          select: {
            service: { select: { id: true, name: true, amount: true } },
            quantity: true,
          },
        },
        tasks: { select: { task: { select: taskReferenceSelect } } },
        customFieldValues: { select: customFieldValueSelect },
      },
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
    company,
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
