import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { EventLog } from "@/generated/prisma";
import type { ProcessEventInteractor as ProcessEventInteractorType } from "@/features/event/process-event.interactor";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { transactionStorage } = await import("@/core/decorators/transaction-context");
const { PermissionService } = await import("@/core/base/permission.service");
const { handleError } = await import("@/core/api/structured-interactor-handler");
const { getUpsertWebhookInteractor } = await import("@/core/di");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { RecordTrashService } = await import("../record-trash.service");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { ProcessDueEventsInteractor } = await import("@/features/event/process-due-events.interactor");
const { ProcessEventInteractor } = await import("@/features/event/process-event.interactor");
const { WebhookAdmission } = await import("@/features/webhook/webhook-admission");
const { PrismaWebhookAdmissionRepo } = await import("@/features/webhook/prisma-webhook-admission.repository");
const { PrismaWebhookDeliveryRepo } = await import("@/features/webhook/prisma-webhook-delivery.repository");
const { DeliverWebhookInteractor } = await import("@/features/webhook/deliver-webhook.interactor");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { createTestRecordRecipientReader } = await import("@/tests/helpers/record-delivery");
const { PrismaEventLogRepo } = await import("@/features/event/prisma-event-log.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const TOTAL = 48;
const PARALLEL = 8;

type Dispatched = { companyId: string; deliveryId?: string };

function backgroundWorkers() {
  const pending = new Set<Promise<unknown>>();
  const reader = createTestRecordRecipientReader();
  const post = vi
    .fn()
    .mockResolvedValue({ success: false, statusCode: null, responseMessage: "Webhook network error" });
  const concurrency = { active: 0, peak: 0 };
  const background = {
    dispatch: (id: string, payload: Dispatched) => {
      const start = () => {
        const work = id === "process-events" ? drainEvents(payload.companyId) : deliver(payload);
        pending.add(work);
        void work.finally(() => pending.delete(work));
        return Promise.resolve();
      };
      const store = transactionStorage.getStore();
      if (!store) return start();
      store.afterCommit.push(start);
      return Promise.resolve();
    },
  };
  const process = new ProcessEventInteractor(
    new PrismaEventLogRepo({ dispatch: () => Promise.resolve() }),
    new WebhookAdmission(
      reader,
      background as never,
      new PrismaWebhookAdmissionRepo(),
      new PrismaWebhookDeliveryRepo(reader),
    ),
  );
  const countedProcess = {
    invoke: async (input: { companyId: string; eventId: string }) => {
      concurrency.active += 1;
      concurrency.peak = Math.max(concurrency.peak, concurrency.active);
      try {
        return await process.invoke(input);
      } finally {
        concurrency.active -= 1;
      }
    },
  } as unknown as ProcessEventInteractorType;
  const drainer = new ProcessDueEventsInteractor(
    new PrismaEventLogRepo({ dispatch: () => Promise.resolve() }),
    countedProcess,
    background as never,
  );
  const deliverer = new DeliverWebhookInteractor(
    new PrismaWebhookDeliveryRepo(createTestRecordRecipientReader()),
    reader,
    { post },
  );

  async function drainEvents(companyId: string) {
    await drainer.invoke({ companyId });
  }

  async function deliver(payload: Dispatched) {
    if (payload.deliveryId) await deliverer.invoke({ companyId: payload.companyId, deliveryId: payload.deliveryId });
  }

  async function settle() {
    while (pending.size) await Promise.all([...pending]);
  }

  return { background, post, concurrency, settle };
}

async function fixture(background: { dispatch: (id: string, payload: Dispatched) => Promise<void> }) {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, admin };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo(undefined, background as never);
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    background as never,
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const id = (key: string) => presetId(seed.company.id, key);
  const hook = await runWithTenant(admin, () =>
    getUpsertWebhookInteractor().invoke({
      url: "https://unreachable.example.test/hook",
      events: ["record.created"],
      expectedSchemaRevision: 1,
      recordTrigger: { query: { typeId: id("service"), filters: [], relationships: [] }, changedFieldIds: [] },
    }),
  );
  if (!hook.ok) throw new Error("Webhook fixture failed");
  const create = (index: number) =>
    runWithTenant(admin, () =>
      mutate.invoke({
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: id("service"),
          fields: [{ fieldId: id("service.name"), value: { kind: "text", value: `Concurrent ${index}` } }],
        },
      }),
    );
  return { companyId: seed.company.id, create };
}

async function outcome(write: Promise<{ ok: boolean }>): Promise<number> {
  try {
    const result = await write;
    return result.ok ? 200 : 400;
  } catch (error) {
    const response = handleError(error);
    const body = (await response.json()) as { error?: { kind?: string } };
    expect(body.error?.kind).toBe("rate_limit");
    return response.status;
  }
}

describeDatabase("concurrent record writes with a failing record webhook", () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  }, 120000);

  it("answers every write, drains the outbox with one worker and backs failed deliveries off", async () => {
    const workers = backgroundWorkers();
    const f = await fixture(workers.background);
    const statuses: number[] = [];
    for (let start = 0; start < TOTAL; start += PARALLEL) {
      statuses.push(
        ...(await Promise.all(Array.from({ length: PARALLEL }, (_, offset) => outcome(f.create(start + offset))))),
      );
    }
    await workers.settle();

    expect(statuses.every((status) => status === 200 || status === 429)).toBe(true);
    const created = statuses.filter((status) => status === 200).length;
    expect(created).toBeGreaterThan(0);
    expect(workers.concurrency.peak).toBe(1);

    const [undelivered, events, deliveries] = await runWithoutTenant(() =>
      Promise.all([
        prisma.eventLog.count({ where: { companyId: f.companyId, deliveredAt: null } }),
        prisma.eventLog.findMany({ where: { companyId: f.companyId, kind: "record.created" } }),
        prisma.webhookDelivery.findMany({ where: { companyId: f.companyId } }),
      ]),
    );
    expect(undelivered).toBe(0);
    expect(events).toHaveLength(created);
    expect(new Set(deliveries.map((delivery) => delivery.eventId))).toEqual(
      new Set(events.map((event: EventLog) => event.id)),
    );
    for (const delivery of deliveries) {
      expect(delivery.success).toBe(false);
      expect(delivery.leaseToken).toBeNull();
      expect(delivery.nextAttemptAt).not.toBeNull();
    }
    expect(workers.post).toHaveBeenCalledTimes(deliveries.filter((delivery) => delivery.attempts === 1).length);
  }, 180000);
});
