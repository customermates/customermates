import { presetId } from "@/features/records/crm-preset";
import type { Prisma, PrismaClient } from "@/generated/prisma";

import { upsertFixturesById, workspaceFixtureId } from "./helpers";
import { seedRecordEventSubscription } from "./record-event-subscriptions";
import type { WebhookSpec } from "./solutions/define-solution";
import { storyMoment } from "./timeline";

/** The small-business team's healthy webhook: deal and organization changes go to the accounting bridge. */
export const SYNTHETIC_WEBHOOK_URL = "https://accounting-bridge.harborlane-it.example/hooks/crm";
export const SYNTHETIC_WEBHOOK_DESCRIPTION = "Send deal and organization changes to the accounting bridge";
export const SYNTHETIC_WEBHOOK_ID = workspaceFixtureId("22000000", "0000", 1);

/** The team's paused webhook: task changes for the dispatch board, paused after the receiver kept failing. */
export const SYNTHETIC_PAUSED_WEBHOOK_URL = "https://dispatch.harborlane-it.example/hooks/tasks";
export const SYNTHETIC_PAUSED_WEBHOOK_DESCRIPTION =
  "Task changes for the dispatch board (paused while the receiver is down)";
export const SYNTHETIC_PAUSED_WEBHOOK_ID = workspaceFixtureId("22000000", "0000", 2);

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

const EVENTS = ["record.created", "record.updated"];

export type WebhookSeedTarget = { companyId: string; tag: string; ownerUserId: string };

/**
 * Seeds a workspace's webhooks on record changes of their lists. Each one gets deliveries for its latest record events
 * since it was created: all successful while enabled, all failed once paused. Webhooks and deliveries the workspace
 * no longer has are removed.
 */
export async function seedWebhooks(
  prisma: PrismaClient,
  target: WebhookSeedTarget,
  specs: readonly WebhookSpec[],
): Promise<void> {
  const { companyId, tag, ownerUserId } = target;
  const hooks = specs.map((spec, index) => ({
    ...spec,
    id: workspaceFixtureId("22000000", tag, index + 1),
    createdAt: storyMoment(spec.createdDaysAgo),
  }));

  const deliveries: Array<Prisma.WebhookDeliveryUncheckedCreateInput & { id: string }> = [];
  for (const hook of hooks) {
    if (hook.deliveries > (hook.enabled ? Number.POSITIVE_INFINITY : FAILED_RESPONSES.length))
      throw new Error(`Webhook ${hook.key} has more failed deliveries than failure responses`);
    await seedRecordEventSubscription(prisma, companyId, {
      id: hook.id,
      kind: "webhook",
      ownerUserId,
      enabled: hook.enabled,
      events: EVENTS,
      recordTypes: [...hook.lists],
    });
    const recordEvents = await prisma.eventLog.findMany({
      where: {
        companyId,
        subjectKind: "record",
        subjectTypeId: { in: hook.lists.map((list) => presetId(companyId, list)) },
        kind: { in: EVENTS },
        createdAt: { gte: hook.createdAt },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: hook.deliveries,
      select: { id: true, kind: true, createdAt: true },
    });
    if (recordEvents.length !== hook.deliveries) throw new Error(`Missing record events for webhook ${hook.key}`);
    const webhook = {
      id: hook.id,
      companyId,
      description: hook.description,
      enabled: hook.enabled,
      events: EVENTS,
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
        id: workspaceFixtureId("23000000", tag, deliveries.length + 1),
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

  await upsertFixturesById(deliveries, (delivery) =>
    prisma.webhookDelivery.upsert({ where: { id: delivery.id }, update: delivery, create: delivery }),
  );
  await prisma.webhookDelivery.deleteMany({
    where: { companyId, id: { startsWith: `23000000-${tag}-`, notIn: deliveries.map(({ id }) => id) } },
  });
  const retired = await prisma.webhook.findMany({
    where: { companyId, id: { startsWith: `22000000-${tag}-`, notIn: hooks.map(({ id }) => id) } },
    select: { id: true },
  });
  await prisma.recordEventSubscription.deleteMany({ where: { companyId, id: { in: retired.map(({ id }) => id) } } });
  await prisma.webhook.deleteMany({ where: { companyId, id: { in: retired.map(({ id }) => id) } } });
}
