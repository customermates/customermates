import { presetId } from "@/features/records/crm-preset";
import type { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";

import { fixtureId, upsertFixturesById } from "./helpers";
import { seedRecordEventSubscription } from "./record-event-subscriptions";
import { storyMoment } from "./timeline";

/** Healthy webhook: deal and organization changes go to the accounting bridge; every recent delivery succeeded. */
export const SYNTHETIC_WEBHOOK_URL = "https://accounting-bridge.harborlane-it.example/hooks/crm";
export const SYNTHETIC_WEBHOOK_DESCRIPTION = "Send deal and organization changes to the accounting bridge";
export const SYNTHETIC_WEBHOOK_ID = fixtureId("22000000", 1);

/** Paused webhook: task changes for the dispatch board, paused after the receiver kept failing. */
export const SYNTHETIC_PAUSED_WEBHOOK_URL = "https://dispatch.harborlane-it.example/hooks/tasks";
export const SYNTHETIC_PAUSED_WEBHOOK_DESCRIPTION =
  "Task changes for the dispatch board (paused while the receiver is down)";
export const SYNTHETIC_PAUSED_WEBHOOK_ID = fixtureId("22000000", 2);

const HEALTHY_DELIVERIES = 18;
const FAILED_RESPONSES = [
  [502, "Bad Gateway"],
  [502, "Bad Gateway"],
  [503, "Service Unavailable"],
  [500, "Synthetic receiver error"],
  [504, "Gateway Timeout"],
  [404, "Not Found"],
  [404, "Not Found"],
  [404, "Not Found"],
] as const;

export async function seedWebhooks(context: SeedContext): Promise<void> {
  const { prisma, ids } = context;
  const companyId = ids.company;
  const events = ["record.created", "record.updated"];
  const hooks = [
    {
      id: SYNTHETIC_WEBHOOK_ID,
      description: SYNTHETIC_WEBHOOK_DESCRIPTION,
      url: SYNTHETIC_WEBHOOK_URL,
      enabled: true,
      recordTypes: ["deal", "organization"],
      createdAt: storyMoment(210),
    },
    {
      id: SYNTHETIC_PAUSED_WEBHOOK_ID,
      description: SYNTHETIC_PAUSED_WEBHOOK_DESCRIPTION,
      url: SYNTHETIC_PAUSED_WEBHOOK_URL,
      enabled: false,
      recordTypes: ["task"],
      createdAt: storyMoment(120),
    },
  ] as const;

  const deliveries: Prisma.WebhookDeliveryUncheckedCreateInput[] = [];
  for (const hook of hooks) {
    await seedRecordEventSubscription(context, {
      id: hook.id,
      kind: "webhook",
      ownerUserId: ids.user,
      enabled: hook.enabled,
      events,
      recordTypes: [...hook.recordTypes],
    });
    const recordEvents = await prisma.eventLog.findMany({
      where: {
        companyId,
        subjectKind: "record",
        subjectTypeId: { in: hook.recordTypes.map((type) => presetId(companyId, type)) },
        kind: { in: events },
        createdAt: { gte: hook.createdAt },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: hook.enabled ? HEALTHY_DELIVERIES : FAILED_RESPONSES.length,
      select: { id: true, kind: true, createdAt: true },
    });
    const expected = hook.enabled ? HEALTHY_DELIVERIES : FAILED_RESPONSES.length;
    if (recordEvents.length !== expected) throw new Error(`Missing record events for webhook ${hook.id}`);
    const webhook = {
      id: hook.id,
      companyId,
      description: hook.description,
      enabled: hook.enabled,
      events,
      createdAt: hook.createdAt,
      secret: null,
      url: hook.url,
      updatedAt: hook.enabled
        ? hook.createdAt
        : new Date((recordEvents[0]?.createdAt ?? hook.createdAt).getTime() + 3_600_000),
    } satisfies Prisma.WebhookCreateManyInput;
    await prisma.webhook.upsert({ where: { id: webhook.id }, update: webhook, create: webhook });

    for (const [position, recordEvent] of [...recordEvents].reverse().entries()) {
      const createdAt = new Date(recordEvent.createdAt.getTime() + 2_000);
      const failure = hook.enabled ? null : FAILED_RESPONSES[position];
      deliveries.push({
        id: fixtureId("23000000", deliveries.length + 1),
        companyId,
        webhookId: webhook.id,
        eventId: recordEvent.id,
        subscriptionRevision: 1,
        admissionKey: `${webhook.id}:${recordEvent.id}`,
        createdAt,
        deliveredAt: new Date(createdAt.getTime() + (failure ? 10_000 : 450)),
        nextAttemptAt: null,
        event: recordEvent.kind,
        requestBody: { eventId: recordEvent.id },
        responseMessage: failure ? failure[1] : "OK",
        status: failure ? "failed" : "success",
        statusCode: failure ? failure[0] : 200,
        success: !failure,
        url: webhook.url,
      });
    }
  }

  await upsertFixturesById(
    deliveries as Array<Prisma.WebhookDeliveryUncheckedCreateInput & { id: string }>,
    (delivery) => prisma.webhookDelivery.upsert({ where: { id: delivery.id }, update: delivery, create: delivery }),
  );
  await prisma.webhookDelivery.deleteMany({
    where: { companyId, id: { startsWith: "23000000-", notIn: deliveries.map(({ id }) => id as string) } },
  });
  await prisma.webhook.deleteMany({
    where: { companyId, id: { startsWith: "22000000-", notIn: hooks.map(({ id }) => id) } },
  });
}
