import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/app-di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: vi.fn().mockResolvedValue(undefined) } }));

import { tasks } from "@trigger.dev/sdk/v3";
import { EventService } from "../event.service";
import { DomainEvent } from "../domain-events";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { transactionStorage } from "@/core/decorators/transaction-context";

const triggerMock = vi.mocked(tasks.trigger);

const CONTACT_ID = "00000000-0000-4000-8000-000000000001";

describe("EventService webhook dispatch", () => {
  let auditLogRepo: any;
  let webhookRepo: any;
  let webhookDeliveryRepo: any;
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogRepo = { log: vi.fn().mockResolvedValue(undefined) };
    webhookRepo = { getWebhooksForEvent: vi.fn().mockResolvedValue([]) };
    webhookDeliveryRepo = { create: vi.fn().mockResolvedValue([]) };
    service = new EventService([], webhookRepo, webhookDeliveryRepo, auditLogRepo);
  });

  it("dispatches trigger.dev immediately when not inside a transaction", async () => {
    webhookRepo.getWebhooksForEvent.mockResolvedValue([
      { url: "https://hook.example/path", events: [DomainEvent.CONTACT_UPDATED] },
    ]);
    webhookDeliveryRepo.create.mockResolvedValue(["delivery-1"]);

    await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: CONTACT_ID,
        payload: { changes: { firstName: { from: "A", to: "B" } } } as any,
      }),
    );

    expect(triggerMock).toHaveBeenCalledTimes(1);
    const [taskName, payload] = triggerMock.mock.calls[0];
    expect(taskName).toBe("deliver-webhook");
    expect(payload).toEqual({
      deliveryId: "delivery-1",
      url: "https://hook.example/path",
      companyId: mockUser.companyId,
      requestBody: expect.objectContaining({
        event: DomainEvent.CONTACT_UPDATED,
        data: expect.any(Object),
        timestamp: expect.any(String),
      }),
    });
  });

  it("defers trigger.dev dispatch to afterCommit when inside a transaction", async () => {
    webhookRepo.getWebhooksForEvent.mockResolvedValue([
      { url: "https://hook.example/path", events: [DomainEvent.CONTACT_UPDATED] },
    ]);
    webhookDeliveryRepo.create.mockResolvedValue(["delivery-2"]);

    let afterCommitLen = -1;
    let triggerCallsDuringTransaction = -1;

    await runWithTenant(mockUser, () =>
      transactionStorage.run(
        { client: {} as any, auditLogBatch: [], webhookDeliveryBatch: [], afterCommit: [], enabledWebhooks: null },
        async () => {
          await service.publish(DomainEvent.CONTACT_UPDATED, {
            entityId: CONTACT_ID,
            payload: { changes: { firstName: { from: "A", to: "B" } } } as any,
          });
          const store = transactionStorage.getStore();
          if (!store) throw new Error("expected transaction store inside transactionStorage.run");
          afterCommitLen = store.afterCommit.length;
          triggerCallsDuringTransaction = triggerMock.mock.calls.length;
        },
      ),
    );

    expect(triggerCallsDuringTransaction).toBe(0);
    expect(afterCommitLen).toBe(1);
  });

  it("does not call trigger.dev when no webhooks match the event", async () => {
    webhookRepo.getWebhooksForEvent.mockResolvedValue([]);

    await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: CONTACT_ID,
        payload: { changes: { firstName: { from: "A", to: "B" } } } as any,
      }),
    );

    expect(triggerMock).not.toHaveBeenCalled();
    expect(webhookDeliveryRepo.create).not.toHaveBeenCalled();
  });
});
