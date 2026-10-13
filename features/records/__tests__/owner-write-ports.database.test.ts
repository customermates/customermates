import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" } }));

const { prisma } = await import("@/prisma/db");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PermissionService } = await import("@/core/base/permission.service");
const { PrismaEventLogRepo } = await import("@/features/event/prisma-event-log.repository");
const { PrismaWebhookDeliveryRepo } = await import("@/features/webhook/prisma-webhook-delivery.repository");
const { PrismaConnectedAccountRepo } = await import("@/ee/messaging/persistence/prisma-connected-account.repository");
const { PrismaUnipileWebhookRepo } = await import("@/ee/messaging/persistence/prisma-unipile-webhook.repository");
const { createTestRecordRecipientReader } = await import("@/tests/helpers/record-delivery");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const OLD = new Date("2000-01-01T00:00:00.000Z");

class Rollback extends Error {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

async function company() {
  const companyId = randomUUID();
  companyIds.push(companyId);
  await runWithoutTenant(() => prisma.company.create({ data: { id: companyId } }));
  return companyId;
}

async function pendingDelivery(companyId: string) {
  return runWithoutTenant(async () => {
    const webhook = await prisma.webhook.create({
      data: { companyId, url: "https://receiver.example.test/owner", events: ["record.created"] },
    });
    const delivery = await prisma.webhookDelivery.create({
      data: { companyId, webhookId: webhook.id, url: webhook.url, event: "record.created", requestBody: {} },
    });
    return { webhookId: webhook.id, deliveryId: delivery.id };
  });
}

async function activeOperation(companyId: string) {
  const id = randomUUID();
  await runWithoutTenant(async () => {
    await prisma.recordOperation.create({
      data: {
        companyId,
        id,
        userId: "system:test",
        kind: "mutation",
        expectedRevision: 0,
        request: {},
        createdAt: OLD,
      },
    });
    await prisma.recordSchemaState.create({ data: { companyId, activeOperationId: id } });
  });
  return id;
}

const deliveryRepo = () => new PrismaWebhookDeliveryRepo(createTestRecordRecipientReader());

describeDatabase("owner write ports", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.messagingInboundEvent.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.webhookDelivery.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.webhook.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.recordSchemaState.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.recordOperation.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.eventLog.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    });
  });

  it("detaches only the deleted webhook's deliveries and rolls the detach back with its transaction", async () => {
    const [first, second] = [await company(), await company()];
    const own = await pendingDelivery(first);
    const foreign = await pendingDelivery(second);
    const repo = deliveryRepo();

    await expect(
      runWithoutTenant(() =>
        runInTransaction(async () => {
          await repo.detachWebhookDeliveries(first, own.webhookId);
          throw new Rollback();
        }),
      ),
    ).rejects.toBeInstanceOf(Rollback);
    const kept = await runWithoutTenant(() =>
      prisma.webhookDelivery.findUniqueOrThrow({ where: { id: own.deliveryId } }),
    );
    expect(kept).toMatchObject({ webhookId: own.webhookId });
    expect(kept.nextAttemptAt).not.toBeNull();

    await runWithoutTenant(() => runInTransaction(() => repo.detachWebhookDeliveries(first, foreign.webhookId)));
    await runWithoutTenant(() => runInTransaction(() => repo.detachWebhookDeliveries(first, own.webhookId)));
    const rows = await runWithoutTenant(() =>
      prisma.webhookDelivery.findMany({ where: { id: { in: [own.deliveryId, foreign.deliveryId] } } }),
    );
    expect(rows.find((row) => row.id === own.deliveryId)).toMatchObject({
      webhookId: null,
      nextAttemptAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    expect(rows.find((row) => row.id === foreign.deliveryId)).toMatchObject({ webhookId: foreign.webhookId });
  });

  it("lets exactly one of two concurrent workers claim a webhook delivery", async () => {
    const companyId = await company();
    const { deliveryId } = await pendingDelivery(companyId);
    const now = new Date();
    const claims = await Promise.all([
      runWithoutTenant(() => deliveryRepo().claimUnscoped(companyId, deliveryId, now)),
      runWithoutTenant(() => deliveryRepo().claimUnscoped(companyId, deliveryId, now)),
    ]);
    expect(claims.filter((claim) => claim.status === "claimed")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "deferred")).toHaveLength(1);
    expect(
      await runWithoutTenant(() => prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } })),
    ).toMatchObject({ status: "processing", attempts: 1 });
  });

  it("skips record operations another worker holds and claims each due operation once", async () => {
    const [first, second] = [await company(), await company()];
    const operations = [await activeOperation(first), await activeOperation(second)];
    const repo = createTestRecordRepo();
    const lease = new Date(OLD.getTime() + 1000);
    const held = deferred<Array<{ companyId: string; operationId: string }>>();
    const release = deferred<null>();

    const holder = runWithoutTenant(() =>
      runInTransaction(async () => {
        const claimed = await repo.claimDueUnscoped(new Date(), lease, 1);
        held.resolve(claimed);
        await release.promise;
        return claimed;
      }),
    );
    const holderClaim = await held.promise;
    const other = await runWithoutTenant(() => runInTransaction(() => repo.claimDueUnscoped(new Date(), lease, 1000)));
    release.resolve(null);
    await holder;

    const key = (row: { companyId: string; operationId: string }) => `${row.companyId}:${row.operationId}`;
    expect(holderClaim).toHaveLength(1);
    expect(other.map(key)).not.toContain(key(holderClaim[0]));
    const claimed = [...holderClaim, ...other].map(key);
    expect(claimed).toEqual(expect.arrayContaining([`${first}:${operations[0]}`, `${second}:${operations[1]}`]));
  });

  it("advances an outbox event only from the attempt count it read", async () => {
    const companyId = await company();
    const repo = new PrismaEventLogRepo({ dispatch: () => Promise.resolve() });
    const event = await runWithoutTenant(() =>
      prisma.eventLog.create({
        data: {
          companyId,
          subjectKind: "messaging",
          subjectId: randomUUID(),
          kind: "messaging.message.received",
          payload: {},
        },
      }),
    );

    expect(await runWithoutTenant(() => repo.deferUnscoped(event, new Date()))).toBe(true);
    expect(await runWithoutTenant(() => repo.deferUnscoped(event, new Date()))).toBe(false);
    await expect(runWithoutTenant(() => repo.markDeliveredUnscoped(event, new Date()))).rejects.toThrow(
      "Event admission lost its transaction precondition",
    );
    const current = await runWithoutTenant(() =>
      prisma.eventLog.findFirstOrThrow({ where: { companyId, id: event.id } }),
    );
    expect(current).toMatchObject({ attempts: 1, deliveredAt: null, lastFailureCode: "admission_failed" });
    await runWithoutTenant(() => repo.markDeliveredUnscoped(current, new Date()));
    expect(await runWithoutTenant(() => repo.findUnscoped(companyId, event.id))).toMatchObject({
      attempts: 2,
      lastFailureCode: null,
    });
  });

  it("records an unusable provider item through the inbound event owner inside the caller's transaction", async () => {
    const [first, second] = [await company(), await company()];
    const accounts = new PrismaConnectedAccountRepo(new PermissionService(), new PrismaUnipileWebhookRepo());
    const item = (companyId: string, unipileMessageId: string) => ({
      companyId,
      connectedAccountId: null as unknown as string,
      payload: { reason: "unusable" },
      unipileMessageId,
    });

    await expect(
      runWithoutTenant(() =>
        runInTransaction(async () => {
          await accounts.recordUnusableItemUnscoped(item(first, "rolled-back"));
          throw new Rollback();
        }),
      ),
    ).rejects.toBeInstanceOf(Rollback);
    await runWithoutTenant(() => runInTransaction(() => accounts.recordUnusableItemUnscoped(item(first, "kept"))));

    const rows = await runWithoutTenant(() =>
      prisma.messagingInboundEvent.findMany({ where: { companyId: { in: [first, second] } } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyId: first, source: "backfill", unipileMessageId: "kept", processed: false });
  });
});
