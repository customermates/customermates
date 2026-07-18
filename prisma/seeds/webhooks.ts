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

import { fixtureId, upsertFixturesById } from "./helpers";

export const SYNTHETIC_WEBHOOK_URL = "https://receiver.example/webhooks/customermates";
export const SYNTHETIC_WEBHOOK_DESCRIPTION = "Webhook for demo";

const WEBHOOK_TIMELINE_END = Date.parse("2026-04-02T12:00:00.000Z");
const WEBHOOK_TIMELINE_STEP = 9 * 60_000;

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
    entityIndex: 0,
    entityType: "organization",
    event: DomainEvent.ORGANIZATION_UPDATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 1,
    entityType: "contact",
    event: DomainEvent.CONTACT_DELETED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 2,
    entityType: "contact",
    event: DomainEvent.CONTACT_UPDATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 0,
    entityType: "deal",
    event: DomainEvent.DEAL_CREATED,
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 3,
    entityType: "organization",
    event: DomainEvent.ORGANIZATION_UPDATED,
    status: "processing",
    statusCode: null,
  },
  {
    entityIndex: 4,
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
    entityIndex: 5,
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
    entityIndex: 8,
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
    entityIndex: 11,
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
    if (definition.event === DomainEvent.CONTACT_UPDATED) {
      return {
        ...base,
        payload: {
          contact,
          changes: {
            firstName: {
              previous: `Legacy ${contact.firstName}`,
              current: contact.firstName,
            },
          },
        },
      };
    }
    return { ...base, payload: contact };
  }

  if (definition.entityType === "deal") {
    const deal = snapshotOrThrow(snapshots.deals, id, "deal");
    if (definition.event === DomainEvent.DEAL_UPDATED) {
      return {
        ...base,
        payload: {
          deal,
          changes: {
            totalValue: {
              previous: Math.max(0, deal.totalValue - 1_000),
              current: deal.totalValue,
            },
          },
        },
      };
    }
    return { ...base, payload: deal };
  }

  const organization = snapshotOrThrow(snapshots.organizations, id, "organization");
  if (definition.event === DomainEvent.ORGANIZATION_UPDATED) {
    return {
      ...base,
      payload: {
        organization,
        changes: {
          name: {
            previous: `Legacy ${organization.name}`,
            current: organization.name,
          },
        },
      },
    };
  }
  return { ...base, payload: organization };
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
      DomainEvent.CONTACT_UPDATED,
      DomainEvent.CONTACT_DELETED,
      DomainEvent.ORGANIZATION_CREATED,
      DomainEvent.ORGANIZATION_UPDATED,
    ],
    secret: null,
    url: SYNTHETIC_WEBHOOK_URL,
  } satisfies Prisma.WebhookCreateManyInput;

  const deliveries = SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.map((definition, index) => {
    const createdAt = new Date(WEBHOOK_TIMELINE_END - (index + 1) * WEBHOOK_TIMELINE_STEP);
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
}
