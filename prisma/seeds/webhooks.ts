import type { ContactDto } from "@/features/contacts/contact.schema";
import type { DealDto } from "@/features/deals/deal.schema";
import type { DomainEventMap } from "@/features/event/domain-events";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { Prisma } from "@/generated/prisma";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";
import { DealDtoSchema } from "@/features/deals/deal.schema";
import { DomainEvent } from "@/features/event/domain-events";
import { OrganizationDtoSchema } from "@/features/organizations/organization.schema";

import type { SeedContext } from "./context";

import {
  SYNTHETIC_PREVIOUS_CONTACT_FIRST_NAMES,
  SYNTHETIC_PREVIOUS_DEAL_NAMES,
  SYNTHETIC_PREVIOUS_ORGANIZATION_NAMES,
} from "./audit-logs";
import { dealSeedSelect } from "./deal-select";
import { fixtureId, upsertFixturesById } from "./helpers";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

export const SYNTHETIC_WEBHOOK_URL = "https://receiver.example/webhooks/customermates";
export const SYNTHETIC_WEBHOOK_DESCRIPTION = "Webhook for demo";

type DeliveryState = Readonly<{
  status: "failed" | "processing" | "success";
  statusCode: number | null;
}>;

type ContactDeliveryDefinition = DeliveryState &
  Readonly<{
    entityIndex: number;
    entityType: "contact";
    event: DomainEvent.CONTACT_CREATED | DomainEvent.CONTACT_DELETED | DomainEvent.CONTACT_UPDATED;
  }>;

type DealDeliveryDefinition = DeliveryState &
  Readonly<{
    entityIndex: number;
    entityType: "deal";
    event: DomainEvent.DEAL_CREATED | DomainEvent.DEAL_UPDATED;
  }>;

type OrganizationDeliveryDefinition = DeliveryState &
  Readonly<{
    entityIndex: number;
    entityType: "organization";
    event: DomainEvent.ORGANIZATION_CREATED | DomainEvent.ORGANIZATION_UPDATED;
  }>;

type DeliveryDefinition = ContactDeliveryDefinition | DealDeliveryDefinition | OrganizationDeliveryDefinition;
type SeededWebhookEvent = DeliveryDefinition["event"];
type SeededWebhookRequestBody = {
  [E in SeededWebhookEvent]: Readonly<{
    data: DomainEventMap[E];
    event: E;
    timestamp: string;
  }>;
}[SeededWebhookEvent];

type WebhookSnapshots = Readonly<{
  contacts: ReadonlyMap<string, ContactDto>;
  deals: ReadonlyMap<string, DealDto>;
  organizations: ReadonlyMap<string, OrganizationDto>;
}>;

export const SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS = [
  {
    entityIndex: 12,
    entityType: "organization",
    event: DomainEvent.ORGANIZATION_UPDATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 1,
    entityType: "contact",
    event: DomainEvent.CONTACT_CREATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 0,
    entityType: "contact",
    event: DomainEvent.CONTACT_UPDATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 3,
    entityType: "deal",
    event: DomainEvent.DEAL_CREATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 5,
    entityType: "organization",
    event: DomainEvent.ORGANIZATION_UPDATED,
    status: "processing",
    statusCode: null,
  },
  {
    entityIndex: 10,
    entityType: "organization",
    event: DomainEvent.ORGANIZATION_UPDATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 1,
    entityType: "deal",
    event: DomainEvent.DEAL_UPDATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 6,
    entityType: "contact",
    event: DomainEvent.CONTACT_UPDATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 6,
    entityType: "organization",
    event: DomainEvent.ORGANIZATION_CREATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 7,
    entityType: "contact",
    event: DomainEvent.CONTACT_UPDATED,
    status: "failed",
    statusCode: 404,
  },
  {
    entityIndex: 19,
    entityType: "contact",
    event: DomainEvent.CONTACT_UPDATED,
    status: "failed",
    statusCode: 500,
  },
  {
    entityIndex: 9,
    entityType: "contact",
    event: DomainEvent.CONTACT_CREATED,
    status: "processing",
    statusCode: null,
  },
  {
    entityIndex: 10,
    entityType: "contact",
    event: DomainEvent.CONTACT_CREATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 22,
    entityType: "contact",
    event: DomainEvent.CONTACT_UPDATED,
    status: "failed",
    statusCode: 404,
  },
] as const satisfies ReadonlyArray<DeliveryDefinition>;

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

function entityId(definition: DeliveryDefinition): string {
  const prefix =
    definition.entityType === "contact" ? "60000000" : definition.entityType === "deal" ? "80000000" : "70000000";
  return fixtureId(prefix, definition.entityIndex + 1);
}

function fixtureIds(entityType: DeliveryDefinition["entityType"]): string[] {
  return [
    ...new Set(
      SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.filter((definition) => definition.entityType === entityType).map(entityId),
    ),
  ];
}

function snapshotOrThrow<T>(snapshots: ReadonlyMap<string, T>, id: string, entityType: string): T {
  const snapshot = snapshots.get(id);
  if (!snapshot) throw new Error(`Missing ${entityType} webhook snapshot ${id}`);
  return snapshot;
}

async function loadWebhookSnapshots(context: SeedContext): Promise<WebhookSnapshots> {
  const { prisma, ids } = context;
  const contactIds = fixtureIds("contact");
  const dealIds = fixtureIds("deal");
  const organizationIds = fixtureIds("organization");

  const [contactRows, dealRows, organizationRows] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: contactIds }, companyId: ids.company },
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
    prisma.deal.findMany({
      where: { id: { in: dealIds }, companyId: ids.company },
      orderBy: { id: "asc" },
      select: dealSeedSelect,
    }),
    prisma.organization.findMany({
      where: { id: { in: organizationIds }, companyId: ids.company },
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
  ]);

  if (contactRows.length !== contactIds.length)
    throw new Error(`Expected ${contactIds.length} contact webhook snapshots, received ${contactRows.length}`);

  if (dealRows.length !== dealIds.length)
    throw new Error(`Expected ${dealIds.length} deal webhook snapshots, received ${dealRows.length}`);

  if (organizationRows.length !== organizationIds.length) {
    throw new Error(
      `Expected ${organizationIds.length} organization webhook snapshots, received ${organizationRows.length}`,
    );
  }

  const contacts = contactRows.map((contact) =>
    ContactDtoSchema.parse({
      ...contact,
      organizations: contact.organizations.map(({ organization }) => organization),
      users: contact.users.map(({ user }) => user),
      deals: contact.deals.map(({ deal }) => deal),
      tasks: contact.tasks.map(({ task }) => task),
    }),
  );
  const deals = dealRows.map((deal) =>
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
  );
  const organizations = organizationRows.map((organization) =>
    OrganizationDtoSchema.parse({
      ...organization,
      contacts: organization.contacts.map(({ contact }) => contact),
      users: organization.users.map(({ user }) => user),
      deals: organization.deals.map(({ deal }) => deal),
      tasks: organization.tasks.map(({ task }) => task),
    }),
  );

  return {
    contacts: new Map(contacts.map((contact) => [contact.id, contact])),
    deals: new Map(deals.map((deal) => [deal.id, deal])),
    organizations: new Map(organizations.map((organization) => [organization.id, organization])),
  };
}

function eventData(
  context: SeedContext,
  definition: DeliveryDefinition,
  snapshots: WebhookSnapshots,
): DomainEventMap[SeededWebhookEvent] {
  const id = entityId(definition);
  const base = {
    companyId: context.ids.company,
    entityId: id,
    userId: context.ids.user,
  };

  if (definition.entityType === "contact") {
    const contact = snapshotOrThrow(snapshots.contacts, id, "contact");
    const projectedContact = {
      ...contact,
      avatarUrl: definition.event === DomainEvent.CONTACT_CREATED ? null : contact.avatarUrl,
      deals: [],
      tasks: [],
      ...(definition.event === DomainEvent.CONTACT_CREATED ? { updatedAt: contact.createdAt } : {}),
    };
    if (definition.event === DomainEvent.CONTACT_UPDATED) {
      const previousFirstName = SYNTHETIC_PREVIOUS_CONTACT_FIRST_NAMES.get(definition.entityIndex);
      if (!previousFirstName) throw new Error(`Missing previous contact name for webhook fixture ${id}`);
      return {
        ...base,
        payload: {
          contact: projectedContact,
          changes: {
            firstName: {
              previous: previousFirstName,
              current: contact.firstName,
            },
          },
        },
      };
    }
    return { ...base, payload: projectedContact };
  }

  if (definition.entityType === "deal") {
    const deal = snapshotOrThrow(snapshots.deals, id, "deal");
    const projectedDeal = {
      ...deal,
      tasks: [],
      ...(definition.event === DomainEvent.DEAL_CREATED ? { updatedAt: deal.createdAt } : {}),
    };
    if (definition.event === DomainEvent.DEAL_UPDATED) {
      const previousName = SYNTHETIC_PREVIOUS_DEAL_NAMES.get(definition.entityIndex);
      if (!previousName) throw new Error(`Missing previous deal name for webhook fixture ${id}`);
      return {
        ...base,
        payload: {
          deal: projectedDeal,
          changes: {
            name: {
              previous: previousName,
              current: deal.name,
            },
          },
        },
      };
    }
    return { ...base, payload: projectedDeal };
  }

  const organization = snapshotOrThrow(snapshots.organizations, id, "organization");
  const projectedOrganization = {
    ...organization,
    contacts: [],
    deals: [],
    tasks: [],
    ...(definition.event === DomainEvent.ORGANIZATION_CREATED ? { updatedAt: organization.createdAt } : {}),
  };
  if (definition.event === DomainEvent.ORGANIZATION_UPDATED) {
    const previousName = SYNTHETIC_PREVIOUS_ORGANIZATION_NAMES.get(definition.entityIndex);
    if (!previousName) throw new Error(`Missing previous organization name for webhook fixture ${id}`);
    return {
      ...base,
      payload: {
        organization: projectedOrganization,
        changes: {
          name: {
            previous: previousName,
            current: organization.name,
          },
        },
      },
    };
  }
  return { ...base, payload: projectedOrganization };
}

function requestBody(
  context: SeedContext,
  definition: DeliveryDefinition,
  snapshots: WebhookSnapshots,
  timestamp: string,
): SeededWebhookRequestBody {
  return {
    data: eventData(context, definition, snapshots),
    event: definition.event,
    timestamp,
  } as SeededWebhookRequestBody;
}

export async function seedWebhooks(context: SeedContext): Promise<void> {
  const { prisma, ids } = context;
  const snapshots = await loadWebhookSnapshots(context);
  const webhook = {
    id: fixtureId("22000000", 1),
    companyId: ids.company,
    description: SYNTHETIC_WEBHOOK_DESCRIPTION,
    enabled: false,
    events: [
      DomainEvent.CONTACT_CREATED,
      DomainEvent.CONTACT_UPDATED,
      DomainEvent.DEAL_CREATED,
      DomainEvent.DEAL_UPDATED,
      DomainEvent.ORGANIZATION_CREATED,
      DomainEvent.ORGANIZATION_UPDATED,
    ],
    createdAt: SYNTHETIC_SEED_TIMELINE.webhook.createdAt,
    secret: null,
    url: SYNTHETIC_WEBHOOK_URL,
    updatedAt: SYNTHETIC_SEED_TIMELINE.webhook.updatedAt,
  } satisfies Prisma.WebhookCreateManyInput;

  const deliveries = SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.map((definition, index) => {
    const createdAt = SYNTHETIC_SEED_TIMELINE.webhookDelivery(index);
    const terminal = definition.status !== "processing";

    return {
      id: fixtureId("23000000", index + 1),
      companyId: ids.company,
      createdAt,
      deliveredAt: terminal ? new Date(createdAt.getTime() + 1_500) : null,
      event: definition.event,
      requestBody: inputJson(requestBody(context, definition, snapshots, createdAt.toISOString())),
      responseMessage:
        definition.status === "success"
          ? "OK"
          : definition.status === "failed"
            ? definition.statusCode === 404
              ? "Not Found"
              : "Synthetic receiver error"
            : null,
      status: definition.status,
      statusCode: definition.statusCode,
      success: definition.status === "success",
      url: SYNTHETIC_WEBHOOK_URL,
    } satisfies Prisma.WebhookDeliveryCreateManyInput;
  });

  await prisma.webhook.upsert({
    where: { id: webhook.id },
    update: webhook,
    create: webhook,
  });
  await upsertFixturesById(deliveries, (delivery) =>
    prisma.webhookDelivery.upsert({
      where: { id: delivery.id },
      update: delivery,
      create: delivery,
    }),
  );
  await prisma.webhookDelivery.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "23000000-", notIn: deliveries.map(({ id }) => id) },
    },
  });
  await prisma.webhook.deleteMany({
    where: {
      companyId: ids.company,
      id: { startsWith: "22000000-", notIn: [webhook.id] },
    },
  });
}
