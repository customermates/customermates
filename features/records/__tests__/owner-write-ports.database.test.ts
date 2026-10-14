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
const { createTestRecordRecipientReader, createTestRoutineRepo } = await import("@/tests/helpers/record-delivery");
const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { prismaAgentChatRepoDependencies } = await import("@/tests/helpers/prisma-agent-chat-repo");
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

async function runningRoutineRun(companyId: string) {
  return runWithoutTenant(async () => {
    const user = await prisma.user.create({
      data: { companyId, email: `${randomUUID()}@owner-ports.invalid`, firstName: "Owner", lastName: "Ports" },
    });
    const routine = await prisma.routine.create({
      data: { companyId, name: "Owner ports", prompt: "Check", triggerKind: "schedule", ownerUserId: user.id },
    });
    const run = await prisma.routineRun.create({
      data: {
        companyId,
        routineId: routine.id,
        executedByUserId: user.id,
        executedByName: "Owner Ports",
        triggerKind: "schedule",
        scheduledFor: new Date(),
        status: "running",
      },
    });
    const conversation = await prisma.agentConversation.create({
      data: { companyId, userId: user.id, origin: "routine" },
    });
    return { userId: user.id, runId: run.id, conversationId: conversation.id };
  });
}

const deliveryRepo = () => new PrismaWebhookDeliveryRepo(createTestRecordRecipientReader());

describeDatabase("owner write ports", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.messagingInboundEvent.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.routineRun.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.routine.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.agentConversation.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
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
    expect(await runWithoutTenant(() => repo.markDeliveredUnscoped(event, new Date()))).toBe(false);
    const current = await runWithoutTenant(() =>
      prisma.eventLog.findFirstOrThrow({ where: { companyId, id: event.id } }),
    );
    expect(current).toMatchObject({ attempts: 1, deliveredAt: null, lastFailureCode: "admission_failed" });
    expect(await runWithoutTenant(() => repo.markDeliveredUnscoped(current, new Date()))).toBe(true);
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

  it("links a routine run to its conversation once, only in its own company, and rolls a release back", async () => {
    const [first, second] = [await company(), await company()];
    const own = await runningRoutineRun(first);
    const routines = createTestRoutineRepo();
    const link = { routineRunId: own.runId, executedByUserId: own.userId, conversationId: own.conversationId };

    expect(await runWithoutTenant(() => routines.linkConversationCompanyWide({ ...link, companyId: second }))).toBe(
      false,
    );
    const attempts = await Promise.all([
      runWithoutTenant(() => routines.linkConversationCompanyWide({ ...link, companyId: first })),
      runWithoutTenant(() => routines.linkConversationCompanyWide({ ...link, companyId: first })),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);

    await expect(
      runWithoutTenant(() =>
        runInTransaction(async () => {
          expect(await routines.releaseUnstartedConversationCompanyWide({ ...link, companyId: first })).toBe(true);
          throw new Rollback();
        }),
      ),
    ).rejects.toBeInstanceOf(Rollback);
    expect(
      await runWithoutTenant(() => prisma.routineRun.findUniqueOrThrow({ where: { id: own.runId } })),
    ).toMatchObject({
      status: "running",
      conversationId: own.conversationId,
    });

    const turnRequestId = randomUUID();
    expect(
      await runWithoutTenant(() =>
        routines.linkAdmittedTurnCompanyWide({ ...link, companyId: first, turnRequestId, startedAt: new Date() }),
      ),
    ).toBe(true);
    expect(
      await runWithoutTenant(() => routines.releaseUnstartedConversationCompanyWide({ ...link, companyId: first })),
    ).toBe(false);
  });

  it("purges only unlinked routine conversations of the named company", async () => {
    const [first, second] = [await company(), await company()];
    const linked = await runningRoutineRun(first);
    const unlinked = await runningRoutineRun(first);
    const foreign = await runningRoutineRun(second);
    await runWithoutTenant(() =>
      prisma.routineRun.update({ where: { id: linked.runId }, data: { conversationId: linked.conversationId } }),
    );
    const conversations = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());

    await runWithoutTenant(() =>
      conversations.deleteUnlinkedRoutineConversationsCompanyWide(first, [
        linked.conversationId,
        unlinked.conversationId,
        foreign.conversationId,
      ]),
    );
    const remaining = await runWithoutTenant(() =>
      prisma.agentConversation.findMany({
        where: { id: { in: [linked.conversationId, unlinked.conversationId, foreign.conversationId] } },
        select: { id: true },
      }),
    );
    expect(remaining.map((row) => row.id).sort()).toEqual([linked.conversationId, foreign.conversationId].sort());
  });
});
