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
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { EventService } from "../event.service";
import { DomainEvent } from "../domain-events";
import { runWithTenant } from "@/core/decorators/tenant-context";

const CONTACT_ID = "00000000-0000-4000-8000-000000000001";

describe("EventService webhook dispatch", () => {
  let auditLogRepo: any;
  let webhookRepo: any;
  let webhookDeliveryRepo: any;
  let backgroundTaskService: { dispatch: ReturnType<typeof vi.fn> };
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogRepo = { log: vi.fn().mockResolvedValue(undefined) };
    webhookRepo = { getWebhooksForEvent: vi.fn().mockResolvedValue([]) };
    webhookDeliveryRepo = { create: vi.fn().mockResolvedValue([]) };
    backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    service = new EventService([], webhookRepo, webhookDeliveryRepo, auditLogRepo, backgroundTaskService as never);
  });

  it("dispatches deliver-webhook with full payload when a webhook matches the event", async () => {
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

    expect(backgroundTaskService.dispatch).toHaveBeenCalledTimes(1);
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("deliver-webhook", {
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

  it("does not dispatch when no webhooks match the event", async () => {
    webhookRepo.getWebhooksForEvent.mockResolvedValue([]);

    await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: CONTACT_ID,
        payload: { changes: { firstName: { from: "A", to: "B" } } } as any,
      }),
    );

    expect(backgroundTaskService.dispatch).not.toHaveBeenCalled();
    expect(webhookDeliveryRepo.create).not.toHaveBeenCalled();
  });
});

describe("EventService no-op update skip", () => {
  let auditLogRepo: any;
  let webhookRepo: any;
  let webhookDeliveryRepo: any;
  let backgroundTaskService: { dispatch: ReturnType<typeof vi.fn> };
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogRepo = { log: vi.fn().mockResolvedValue(undefined) };
    webhookRepo = { getWebhooksForEvent: vi.fn().mockResolvedValue([]) };
    webhookDeliveryRepo = { create: vi.fn().mockResolvedValue([]) };
    backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    service = new EventService([], webhookRepo, webhookDeliveryRepo, auditLogRepo, backgroundTaskService as never);
  });

  it("skips an update whose changes are empty, writing no audit log and dispatching no webhook", async () => {
    const result = await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: CONTACT_ID,
        payload: { contact: { id: CONTACT_ID }, changes: {} } as any,
      }),
    );

    expect(result.skipped).toBe("no-op-update");
    expect(auditLogRepo.log).not.toHaveBeenCalled();
    expect(webhookRepo.getWebhooksForEvent).not.toHaveBeenCalled();
    expect(backgroundTaskService.dispatch).not.toHaveBeenCalled();
  });

  it("publishes an update whose changes are non-empty", async () => {
    const result = await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: CONTACT_ID,
        payload: { contact: { id: CONTACT_ID }, changes: { firstName: { previous: "A", current: "B" } } } as any,
      }),
    );

    expect(result.skipped).toBeNull();
    expect(auditLogRepo.log).toHaveBeenCalledTimes(1);
  });
});
