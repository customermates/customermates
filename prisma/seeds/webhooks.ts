import { presetId } from "@/features/records/crm-preset";
import type { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";

import { fixtureId, upsertFixturesById } from "./helpers";
import { seedRecordEventSubscription } from "./record-event-subscriptions";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

export const SYNTHETIC_WEBHOOK_URL = "https://receiver.example/webhooks/customermates";
export const SYNTHETIC_WEBHOOK_DESCRIPTION = "Webhook for demo";
export const SYNTHETIC_WEBHOOK_ID = fixtureId("22000000", 1);

type DeliveryDefinition = Readonly<{
  entityIndex: number;
  entityType: "contact" | "deal" | "organization";
  event: "record.created" | "record.updated";
  status: "failed" | "processing" | "success";
  statusCode: number | null;
}>;

export const SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS = [
  {
    entityIndex: 12,
    entityType: "organization",
    event: "record.updated",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 1,
    entityType: "contact",
    event: "record.created",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 0,
    entityType: "contact",
    event: "record.updated",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 3,
    entityType: "deal",
    event: "record.created",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 5,
    entityType: "organization",
    event: "record.updated",
    status: "processing",
    statusCode: null,
  },
  {
    entityIndex: 10,
    entityType: "organization",
    event: "record.updated",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 1,
    entityType: "deal",
    event: "record.updated",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 6,
    entityType: "contact",
    event: "record.updated",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 6,
    entityType: "organization",
    event: "record.created",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 7,
    entityType: "contact",
    event: "record.updated",
    status: "failed",
    statusCode: 404,
  },
  {
    entityIndex: 19,
    entityType: "contact",
    event: "record.updated",
    status: "failed",
    statusCode: 500,
  },
  {
    entityIndex: 9,
    entityType: "contact",
    event: "record.created",
    status: "processing",
    statusCode: null,
  },
  {
    entityIndex: 10,
    entityType: "contact",
    event: "record.created",
    status: "success",
    statusCode: 200,
  },
  {
    entityIndex: 22,
    entityType: "contact",
    event: "record.updated",
    status: "failed",
    statusCode: 404,
  },
] as const satisfies ReadonlyArray<DeliveryDefinition>;

function entityId(definition: DeliveryDefinition): string {
  const prefix =
    definition.entityType === "contact" ? "60000000" : definition.entityType === "deal" ? "80000000" : "70000000";
  return fixtureId(prefix, definition.entityIndex + 1);
}

export async function seedWebhooks(context: SeedContext): Promise<void> {
  const { prisma, ids } = context;
  const events = ["record.created", "record.updated"];
  await seedRecordEventSubscription(context, {
    id: SYNTHETIC_WEBHOOK_ID,
    kind: "webhook",
    ownerUserId: ids.user,
    enabled: false,
    events,
    recordTypes: ["contact", "deal", "organization"],
  });
  const webhook = {
    id: SYNTHETIC_WEBHOOK_ID,
    companyId: ids.company,
    description: SYNTHETIC_WEBHOOK_DESCRIPTION,
    enabled: false,
    events,
    createdAt: SYNTHETIC_SEED_TIMELINE.webhook.createdAt,
    secret: null,
    url: SYNTHETIC_WEBHOOK_URL,
    updatedAt: SYNTHETIC_SEED_TIMELINE.webhook.updatedAt,
  } satisfies Prisma.WebhookCreateManyInput;
  await prisma.webhook.upsert({
    where: { id: webhook.id },
    update: webhook,
    create: webhook,
  });

  const recordEvents = await prisma.eventLog.findMany({
    where: {
      companyId: ids.company,
      subjectKind: "record",
      OR: SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.map((definition) => ({
        subjectTypeId: presetId(ids.company, definition.entityType),
        subjectId: entityId(definition),
        kind: definition.event,
      })),
    },
    select: { id: true, subjectTypeId: true, subjectId: true, kind: true },
  });
  const deliveries = SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.map((definition: DeliveryDefinition, index) => {
    const recordEvent = recordEvents.find(
      (event) =>
        event.subjectTypeId === presetId(ids.company, definition.entityType) &&
        event.subjectId === entityId(definition) &&
        event.kind === definition.event,
    );
    if (!recordEvent) throw new Error(`Missing record event for webhook delivery ${index + 1}`);
    const createdAt = SYNTHETIC_SEED_TIMELINE.webhookDelivery(index);
    const terminal = definition.status !== "processing";

    return {
      id: fixtureId("23000000", index + 1),
      companyId: ids.company,
      webhookId: webhook.id,
      eventId: recordEvent.id,
      subscriptionRevision: 1,
      admissionKey: `${webhook.id}:${recordEvent.id}`,
      createdAt,
      deliveredAt: terminal ? new Date(createdAt.getTime() + 1_500) : null,
      nextAttemptAt: null,
      event: definition.event,
      requestBody: { eventId: recordEvent.id },
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
    } satisfies Prisma.WebhookDeliveryUncheckedCreateInput;
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
