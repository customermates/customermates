import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { presetId } from "@/features/records/crm-preset";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";
import {
  seedWebhooks,
  SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS,
  SYNTHETIC_WEBHOOK_ID,
  SYNTHETIC_WEBHOOK_URL,
} from "../seeds/webhooks";

const PREFIX = { contact: "60000000", deal: "80000000", organization: "70000000" } as const;

function recordEvents() {
  return SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.map((definition, index) => ({
    id: fixtureId("3a000000", index + 1),
    typeId: presetId(SEED_IDS.company, definition.entityType),
    recordId: fixtureId(PREFIX[definition.entityType], definition.entityIndex + 1),
    kind: definition.event,
  }));
}

async function seed() {
  const calls = {
    webhook: [] as Array<{ create: Record<string, unknown>; update: Record<string, unknown> }>,
    deliveries: [] as Array<{ create: Record<string, unknown>; update: Record<string, unknown> }>,
    subscriptions: [] as Array<{ create: Record<string, unknown> }>,
  };
  const prisma = {
    recordEventSubscription: {
      upsert: vi.fn((input: { create: Record<string, unknown> }) => {
        calls.subscriptions.push(input);
        return Promise.resolve(input.create);
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    recordEvent: { findMany: vi.fn().mockResolvedValue(recordEvents()) },
    webhook: {
      upsert: vi.fn((input: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        calls.webhook.push(input);
        return Promise.resolve(input.create);
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    webhookDelivery: {
      upsert: vi.fn((input: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        calls.deliveries.push(input);
        return Promise.resolve(input.create);
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaClient;
  const context = {
    prisma,
    ids: SEED_IDS,
    seedUserEmail: SYNTHETIC_SEED_USER.email,
    sharedUserPassword: "test-password",
  } satisfies SeedContext;
  await seedWebhooks(context);
  return calls;
}

describe("synthetic webhook fixtures", () => {
  it("restores the disabled demo webhook on record events without a credential or live endpoint", async () => {
    const calls = await seed();

    expect(calls.webhook).toHaveLength(1);
    expect(calls.webhook[0].create).toMatchObject({
      id: SYNTHETIC_WEBHOOK_ID,
      companyId: SEED_IDS.company,
      enabled: false,
      events: ["record.created", "record.updated"],
      secret: null,
      url: SYNTHETIC_WEBHOOK_URL,
      createdAt: SYNTHETIC_SEED_TIMELINE.webhook.createdAt,
      updatedAt: SYNTHETIC_SEED_TIMELINE.webhook.updatedAt,
    });
    expect(new URL(SYNTHETIC_WEBHOOK_URL).hostname).toBe("receiver.example");
    expect(calls.subscriptions).toHaveLength(1);
    expect(calls.subscriptions[0].create).toMatchObject({
      id: SYNTHETIC_WEBHOOK_ID,
      kind: "webhook",
      ownerUserId: SEED_IDS.user,
      enabled: false,
      events: ["record.created", "record.updated"],
      sources: ["contact", "deal", "organization"].map((type) => ({
        query: { typeId: presetId(SEED_IDS.company, type), filters: [], relationships: [] },
        events: ["record.created", "record.updated"],
        changedFieldIds: [],
      })),
    });
  });

  it("restores 14 deliveries bound to the seeded record events of their record", async () => {
    const calls = await seed();
    const events = recordEvents();

    expect(calls.deliveries).toHaveLength(14);
    for (const [index, { create }] of calls.deliveries.entries()) {
      const definition = SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS[index];
      const event = events[index];
      expect(create).toMatchObject({
        id: fixtureId("23000000", index + 1),
        webhookId: SYNTHETIC_WEBHOOK_ID,
        recordEventId: event.id,
        subscriptionRevision: 1,
        admissionKey: `${SYNTHETIC_WEBHOOK_ID}:${event.id}`,
        event: definition.event,
        requestBody: { version: 2, eventId: event.id },
        status: definition.status,
        statusCode: definition.statusCode,
        success: definition.status === "success",
        url: SYNTHETIC_WEBHOOK_URL,
        nextAttemptAt: null,
        createdAt: SYNTHETIC_SEED_TIMELINE.webhookDelivery(index),
      });
      expect(create.deliveredAt === null).toBe(definition.status === "processing");
    }
  });

  it("produces the same upsert data on every run", async () => {
    const first = await seed();
    const second = await seed();

    expect(second).toEqual(first);
    for (const { create, update } of [...first.webhook, ...first.deliveries]) expect(update).toEqual(create);
  });
});
