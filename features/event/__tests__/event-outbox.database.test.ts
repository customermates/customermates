import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" } }));

const { prisma } = await import("@/prisma/db");
const { DomainEvent } = await import("../domain-events");
const { EventService } = await import("../event.service");
const { PrismaEventLogRepo } = await import("../prisma-event-log.repository");
const { PrismaEventOutboxRepo } = await import("../prisma-event-outbox.repository");
const { ProcessEventInteractor } = await import("../process-event.interactor");
const { EventAdmissionGroup } = await import("../event-admission-group");
const { WebhookAdmission } = await import("@/features/webhook/webhook-admission");
const { RoutineAdmission } = await import("@/ee/routines/routine-admission");
const { createTestRecordRecipientReader } = await import("@/tests/helpers/record-delivery");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const MESSAGE = {
  connectedAccountId: randomUUID(),
  provider: "whatsapp" as const,
  providerMessageId: "provider-message",
  threadId: randomUUID(),
};

async function workspace(events: string[]) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    if (events.length)
      await prisma.webhook.create({ data: { companyId, url: "https://receiver.example.test/outbox", events } });
  });
  return companyId;
}

describeDatabase("event outbox for messaging events", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.webhookDelivery.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.webhook.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    });
  });

  it("keeps an unsubscribed messaging event out of the log", async () => {
    const companyId = await workspace([]);
    const dispatch = vi.fn().mockResolvedValue(undefined);
    await new EventService([], new PrismaEventLogRepo({ dispatch })).publish(
      DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      { entityId: randomUUID(), payload: MESSAGE },
      { systemCompanyId: companyId },
    );

    expect(await runWithoutTenant(() => prisma.eventLog.count({ where: { companyId } }))).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("admits a subscribed messaging event once to its webhooks and event routines with one envelope", async () => {
    const companyId = await workspace([DomainEvent.MESSAGING_MESSAGE_RECEIVED]);
    const entityId = randomUUID();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    await new EventService([], new PrismaEventLogRepo({ dispatch })).publish(
      DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      { entityId, payload: MESSAGE },
      { systemCompanyId: companyId },
    );

    const event = await runWithoutTenant(() => prisma.eventLog.findFirstOrThrow({ where: { companyId } }));
    expect(event).toMatchObject({
      subjectKind: "messaging",
      subjectTypeId: null,
      subjectId: entityId,
      actorId: null,
      kind: DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      payload: MESSAGE,
      deliveredAt: null,
    });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith("process-events", { companyId });

    const routine = { id: randomUUID(), ownerUserId: randomUUID(), triggerFilters: [], updatedAt: new Date() };
    const routines = {
      findEventRoutinesUnscoped: vi.fn().mockResolvedValue([routine]),
      admitEventRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
    };
    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const reader = createTestRecordRecipientReader();
    const process = new ProcessEventInteractor(
      new PrismaEventOutboxRepo(),
      new EventAdmissionGroup([
        new WebhookAdmission(reader, background as never),
        new RoutineAdmission(routines, background as never, reader),
      ]),
    );

    expect(await process.invoke({ companyId, eventId: event.id })).toEqual({ status: "delivered" });
    expect(await process.invoke({ companyId, eventId: event.id })).toEqual({ status: "delivered" });

    const deliveries = await runWithoutTenant(() => prisma.webhookDelivery.findMany({ where: { companyId } }));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      eventId: event.id,
      event: DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      subscriptionRevision: null,
      requestBody: { eventId: event.id },
    });
    expect(background.dispatch).toHaveBeenCalledWith("deliver-webhook", { deliveryId: deliveries[0].id, companyId });
    expect(routines.admitEventRoutineRunsUnscoped).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        companyId,
        event: DomainEvent.MESSAGING_MESSAGE_RECEIVED,
        entityId,
        triggerPayload: {
          event: DomainEvent.MESSAGING_MESSAGE_RECEIVED,
          id: event.id,
          timestamp: event.createdAt.toISOString(),
          companyId,
          actorId: null,
          data: { entityId, ...MESSAGE },
        },
      }),
    );
  });
});
