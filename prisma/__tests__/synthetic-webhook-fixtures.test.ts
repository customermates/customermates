import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { presetId } from "@/features/records/crm-preset";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { fixtureId } from "../seeds/helpers";
import {
  seedWebhooks,
  SYNTHETIC_PAUSED_WEBHOOK_ID,
  SYNTHETIC_PAUSED_WEBHOOK_URL,
  SYNTHETIC_WEBHOOK_ID,
  SYNTHETIC_WEBHOOK_URL,
} from "../seeds/webhooks";

function recordEvents(take: number, offset: number) {
  return Array.from({ length: take }, (_, index) => ({
    id: fixtureId("3a000000", offset + index + 1),
    kind: index % 3 ? "record.updated" : "record.created",
    createdAt: new Date(Date.UTC(2026, 6, 30 - index, 9)),
  }));
}

async function seed() {
  const calls = {
    webhook: [] as Array<{ create: Record<string, unknown>; update: Record<string, unknown> }>,
    deliveries: [] as Array<{ create: Record<string, unknown>; update: Record<string, unknown> }>,
    subscriptions: [] as Array<{ create: Record<string, unknown> }>,
  };
  let lookups = 0;
  const prisma = {
    recordEventSubscription: {
      upsert: vi.fn((input: { create: Record<string, unknown> }) => {
        calls.subscriptions.push(input);
        return Promise.resolve(input.create);
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    eventLog: {
      findMany: vi.fn((input: { take: number }) => Promise.resolve(recordEvents(input.take, 100 * lookups++))),
    },
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
  it("restores a healthy and a paused webhook on reserved hosts without a credential", async () => {
    const calls = await seed();

    expect(calls.webhook.map(({ create }) => [create.id, create.enabled, create.secret])).toEqual([
      [SYNTHETIC_WEBHOOK_ID, true, null],
      [SYNTHETIC_PAUSED_WEBHOOK_ID, false, null],
    ]);
    for (const url of [SYNTHETIC_WEBHOOK_URL, SYNTHETIC_PAUSED_WEBHOOK_URL])
      expect(new URL(url).hostname).toMatch(/\.example$/);
    expect(calls.subscriptions.map(({ create }) => create)).toMatchObject([
      {
        id: SYNTHETIC_WEBHOOK_ID,
        kind: "webhook",
        ownerUserId: SEED_IDS.user,
        enabled: true,
        sources: ["deal", "subscription"].map((type) => ({
          query: { typeId: presetId(SEED_IDS.company, type), filters: [], relationships: [] },
          events: ["record.created", "record.updated"],
          changedFieldIds: [],
        })),
      },
      { id: SYNTHETIC_PAUSED_WEBHOOK_ID, enabled: false },
    ]);
  });

  it("restores successful deliveries for the healthy webhook and failures for the paused one", async () => {
    const calls = await seed();
    const healthy = calls.deliveries.filter(({ create }) => create.webhookId === SYNTHETIC_WEBHOOK_ID);
    const paused = calls.deliveries.filter(({ create }) => create.webhookId === SYNTHETIC_PAUSED_WEBHOOK_ID);

    expect(healthy).toHaveLength(18);
    expect(paused).toHaveLength(8);
    expect(healthy.every(({ create }) => create.status === "success" && create.statusCode === 200)).toBe(true);
    expect(paused.every(({ create }) => create.status === "failed" && !create.success)).toBe(true);
    for (const [index, { create }] of calls.deliveries.entries()) {
      expect(create).toMatchObject({
        id: fixtureId("23000000", index + 1),
        subscriptionRevision: 1,
        admissionKey: `${String(create.webhookId)}:${String(create.eventId)}`,
        requestBody: { eventId: create.eventId },
        nextAttemptAt: null,
      });
      expect(create.deliveredAt).toBeInstanceOf(Date);
    }
    const times = healthy.map(({ create }) => (create.createdAt as Date).getTime());
    expect(times).toEqual(times.toSorted((a, b) => a - b));
  });

  it("produces the same upsert data on every run", async () => {
    const first = await seed();
    const second = await seed();

    expect(second).toEqual(first);
    for (const { create, update } of [...first.webhook, ...first.deliveries]) expect(update).toEqual(create);
  });
});
