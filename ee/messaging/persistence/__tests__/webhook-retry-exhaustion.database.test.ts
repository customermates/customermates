import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaUnipileWebhookRepo } from "../prisma-unipile-webhook.repository";
import { WEBHOOK_INBOUND_SOURCE } from "../../webhooks/webhook-event.repo";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const eventIds: string[] = [];

const { prisma } = await import("@/prisma/db");

afterAll(async () => {
  await runWithoutTenant(() => prisma.messagingInboundEvent.deleteMany({ where: { id: { in: eventIds } } }));
  await prisma.$disconnect();
});

describeDatabase("webhook retry exhaustion against a real database", () => {
  it("returns distinct atomic attempt counts while preserving the retryable event", async () => {
    const repo = new PrismaUnipileWebhookRepo();
    const event = await repo.createWebhookEventUnscoped({
      source: WEBHOOK_INBOUND_SOURCE,
      payload: { type: "email.delete", account_id: `account-${randomUUID()}`, payload: {} },
    });
    eventIds.push(event.id);

    const attempts = await Promise.all(
      Array.from({ length: 11 }, () =>
        repo.markWebhookEventFailedUnscoped({
          id: event.id,
          error: "retry later",
          terminal: false,
        }),
      ),
    );

    expect(attempts.map(({ attemptCount }) => attemptCount).sort((left, right) => left - right)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    await expect(
      runWithoutTenant(() =>
        prisma.messagingInboundEvent.findUniqueOrThrow({
          where: { id: event.id },
          select: { attemptCount: true, error: true, processed: true, processedAt: true },
        }),
      ),
    ).resolves.toEqual({
      attemptCount: 11,
      error: "retry later",
      processed: false,
      processedAt: null,
    });
  });
});
