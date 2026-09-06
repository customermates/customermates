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
import { runInRoutineContext } from "@/core/decorators/routine-context";

function routineTriggerRepoStub() {
  return {
    findEventRoutinesUnscoped: () => Promise.resolve([]),
    countSuppressedRoutineEventsUnscoped: () => Promise.resolve(),
    admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
  };
}

function routineEventAccessStub() {
  return {
    matchesCurrentUser: vi.fn().mockResolvedValue(true),
    matchesUserUnscoped: vi.fn().mockResolvedValue(true),
    canUserAccessUnscoped: vi.fn().mockResolvedValue(true),
  };
}

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
    service = new EventService(
      [],
      webhookRepo,
      webhookDeliveryRepo,
      auditLogRepo,
      backgroundTaskService as never,
      routineTriggerRepoStub(),
      routineEventAccessStub(),
    );
  });

  it("dispatches deliver-webhook with full payload when a webhook matches the event", async () => {
    webhookRepo.getWebhooksForEvent.mockResolvedValue([
      {
        url: "https://hook.example/path",
        events: [DomainEvent.CONTACT_UPDATED],
      },
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
    service = new EventService(
      [],
      webhookRepo,
      webhookDeliveryRepo,
      auditLogRepo,
      backgroundTaskService as never,
      routineTriggerRepoStub(),
      routineEventAccessStub(),
    );
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
        payload: {
          contact: { id: CONTACT_ID },
          changes: { firstName: { previous: "A", current: "B" } },
        } as any,
      }),
    );

    expect(result.skipped).toBeNull();
    expect(auditLogRepo.log).toHaveBeenCalledTimes(1);
  });
});

describe("EventService audit log routing", () => {
  let auditLogRepo: any;
  let webhookRepo: any;
  let webhookDeliveryRepo: any;
  let backgroundTaskService: { dispatch: ReturnType<typeof vi.fn> };
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    auditLogRepo = {
      log: vi.fn().mockResolvedValue(undefined),
      logUnscoped: vi.fn().mockResolvedValue(undefined),
    };
    webhookRepo = {
      getWebhooksForEvent: vi.fn().mockResolvedValue([]),
      getWebhooksForEventUnscoped: vi.fn().mockResolvedValue([]),
    };
    webhookDeliveryRepo = {
      create: vi.fn().mockResolvedValue([]),
      createUnscoped: vi.fn().mockResolvedValue([]),
    };
    backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    service = new EventService(
      [],
      webhookRepo,
      webhookDeliveryRepo,
      auditLogRepo,
      backgroundTaskService as never,
      routineTriggerRepoStub(),
      routineEventAccessStub(),
    );
  });

  it("excludes messaging events from the audit log but still checks webhook subscriptions", async () => {
    await service.publish(
      DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      {
        entityId: CONTACT_ID,
        payload: { connectedAccountId: CONTACT_ID } as any,
      },
      { systemCompanyId: mockUser.companyId },
    );

    expect(auditLogRepo.log).not.toHaveBeenCalled();
    expect(auditLogRepo.logUnscoped).not.toHaveBeenCalled();
    expect(webhookRepo.getWebhooksForEventUnscoped).toHaveBeenCalledWith(
      DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      mockUser.companyId,
    );
  });

  it("skips the audit log for a system event without an actor", async () => {
    await service.publish(
      DomainEvent.CONNECTED_ACCOUNT_CREATED,
      {
        entityId: CONTACT_ID,
        payload: {
          provider: "mail",
          displayName: null,
          emailAddress: null,
        } as any,
      },
      { systemCompanyId: mockUser.companyId },
    );

    expect(auditLogRepo.log).not.toHaveBeenCalled();
    expect(auditLogRepo.logUnscoped).not.toHaveBeenCalled();
  });

  it("audit-logs a system event with an actor through the unscoped repo path", async () => {
    await service.publish(
      DomainEvent.CONNECTED_ACCOUNT_CREATED,
      {
        entityId: CONTACT_ID,
        payload: {
          provider: "mail",
          displayName: null,
          emailAddress: null,
        } as any,
      },
      { systemCompanyId: mockUser.companyId, systemUserId: mockUser.id },
    );

    expect(auditLogRepo.log).not.toHaveBeenCalled();
    expect(auditLogRepo.logUnscoped).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.logUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        event: DomainEvent.CONNECTED_ACCOUNT_CREATED,
        entityId: CONTACT_ID,
        userId: mockUser.id,
        companyId: mockUser.companyId,
      }),
    );
  });
});

describe("EventService routine triggers", () => {
  const ROUTINE_ID = "00000000-0000-4000-8000-0000000000a1";
  const RUN_ID = "00000000-0000-4000-8000-0000000000a2";
  const UPDATED_AT = new Date("2026-09-04T10:00:00.000Z");

  function routineCandidate(overrides: Record<string, unknown> = {}) {
    return {
      id: ROUTINE_ID,
      ownerUserId: mockUser.id,
      changedFields: [],
      triggerFilters: [],
      updatedAt: UPDATED_AT,
      ...overrides,
    };
  }

  let routineRepo: {
    findEventRoutinesUnscoped: ReturnType<typeof vi.fn>;
    countSuppressedRoutineEventsUnscoped: ReturnType<typeof vi.fn>;
    admitEventRoutineRunsUnscoped: ReturnType<typeof vi.fn>;
  };
  let backgroundTaskService: { dispatch: ReturnType<typeof vi.fn> };
  let routineEventAccess: ReturnType<typeof routineEventAccessStub>;
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    routineRepo = {
      findEventRoutinesUnscoped: vi.fn().mockResolvedValue([routineCandidate()]),
      countSuppressedRoutineEventsUnscoped: vi.fn().mockResolvedValue(undefined),
      admitEventRoutineRunsUnscoped: vi
        .fn()
        .mockResolvedValue([{ id: RUN_ID, routineId: ROUTINE_ID, executedByUserId: mockUser.id }]),
    };
    backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    routineEventAccess = routineEventAccessStub();
    service = new EventService(
      [],
      { getWebhooksForEvent: vi.fn().mockResolvedValue([]) } as never,
      { create: vi.fn().mockResolvedValue([]) } as never,
      { log: vi.fn().mockResolvedValue(undefined) } as never,
      backgroundTaskService as never,
      routineRepo as never,
      routineEventAccess as never,
    );
  });

  function publishContactUpdate() {
    return runWithTenant(mockUser, () =>
      service.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: CONTACT_ID,
        payload: { changes: { firstName: { from: "A", to: "B" } } } as never,
      }),
    );
  }

  function publishContactCreate() {
    return runWithTenant(mockUser, () =>
      service.publish(DomainEvent.CONTACT_CREATED, {
        entityId: CONTACT_ID,
        payload: { id: CONTACT_ID, firstName: "A" } as never,
      }),
    );
  }

  it("starts a routine run for a subscribed event", async () => {
    const result = await publishContactUpdate();

    expect(result.routineRuns).toBe(1);
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("run-routine", {
      routineRunId: RUN_ID,
      companyId: mockUser.companyId,
      ownerUserId: mockUser.id,
    });
  });

  it("fans one CRM event out under each admitted run's snapshotted executor", async () => {
    const secondRoutineId = "00000000-0000-4000-8000-0000000000b1";
    const secondRunId = "00000000-0000-4000-8000-0000000000b2";
    const secondExecutorId = "00000000-0000-4000-8000-0000000000b3";
    routineRepo.findEventRoutinesUnscoped.mockResolvedValue([
      routineCandidate(),
      routineCandidate({ id: secondRoutineId, ownerUserId: secondExecutorId }),
    ]);
    routineRepo.admitEventRoutineRunsUnscoped.mockResolvedValue([
      { id: RUN_ID, routineId: ROUTINE_ID, executedByUserId: mockUser.id },
      {
        id: secondRunId,
        routineId: secondRoutineId,
        executedByUserId: secondExecutorId,
      },
    ]);

    const result = await publishContactUpdate();

    expect(result.routineRuns).toBe(2);
    expect(backgroundTaskService.dispatch).toHaveBeenCalledTimes(2);
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("run-routine", {
      routineRunId: RUN_ID,
      companyId: mockUser.companyId,
      ownerUserId: mockUser.id,
    });
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("run-routine", {
      routineRunId: secondRunId,
      companyId: mockUser.companyId,
      ownerUserId: secondExecutorId,
    });
  });

  it("does not create company-visible history for an event the routine owner cannot access", async () => {
    routineEventAccess.matchesUserUnscoped.mockResolvedValue(false);

    const result = await publishContactUpdate();

    expect(result.routineRuns).toBe(0);
    expect(routineRepo.admitEventRoutineRunsUnscoped).not.toHaveBeenCalled();
    expect(backgroundTaskService.dispatch).not.toHaveBeenCalledWith("run-routine", expect.anything());
  });

  it("admits only the checked owner when one event fans out to differently scoped routines", async () => {
    const deniedRoutineId = "00000000-0000-4000-8000-0000000000b1";
    const deniedOwnerId = "00000000-0000-4000-8000-0000000000b3";
    routineRepo.findEventRoutinesUnscoped.mockResolvedValue([
      routineCandidate(),
      routineCandidate({ id: deniedRoutineId, ownerUserId: deniedOwnerId }),
    ]);
    routineEventAccess.matchesUserUnscoped.mockImplementation(({ userId }) => Promise.resolve(userId === mockUser.id));

    await publishContactUpdate();

    expect(routineRepo.admitEventRoutineRunsUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        routines: [{ id: ROUTINE_ID, ownerUserId: mockUser.id, updatedAt: UPDATED_AT }],
      }),
    );
    expect(routineEventAccess.matchesUserUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: mockUser.companyId,
        event: DomainEvent.CONTACT_UPDATED,
        entityId: CONTACT_ID,
        triggerPayload: expect.objectContaining({
          companyId: mockUser.companyId,
        }),
      }),
    );
  });

  it("ignores events that are not part of the subscribable set", async () => {
    await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.COMPANY_UPDATED, {
        entityId: CONTACT_ID,
        payload: { changes: { name: { from: "A", to: "B" } } } as never,
      }),
    );

    expect(routineRepo.findEventRoutinesUnscoped).not.toHaveBeenCalled();
  });

  it("suppresses an event a routine caused, instead of re-triggering the routine", async () => {
    const result = await runInRoutineContext({ causationDepth: 1 }, () => publishContactUpdate());

    expect(result.routineRuns).toBe(0);
    expect(routineRepo.admitEventRoutineRunsUnscoped).not.toHaveBeenCalled();
    expect(backgroundTaskService.dispatch).not.toHaveBeenCalledWith("run-routine", expect.anything());
    expect(routineRepo.countSuppressedRoutineEventsUnscoped).toHaveBeenCalledWith([ROUTINE_ID]);
  });

  it("skips a routine whose required fields did not change", async () => {
    routineRepo.findEventRoutinesUnscoped.mockResolvedValue([routineCandidate({ changedFields: ["stage"] })]);

    const result = await publishContactUpdate();

    expect(result.routineRuns).toBe(0);
    expect(routineRepo.admitEventRoutineRunsUnscoped).not.toHaveBeenCalled();
  });

  it("triggers when one of the required fields is among the changes", async () => {
    routineRepo.findEventRoutinesUnscoped.mockResolvedValue([
      routineCandidate({ changedFields: ["firstName", "stage"] }),
    ]);

    const result = await publishContactUpdate();

    expect(result.routineRuns).toBe(1);
  });

  it("ignores the required fields on an event that reports no changes", async () => {
    routineRepo.findEventRoutinesUnscoped.mockResolvedValue([routineCandidate({ changedFields: ["firstName"] })]);

    const result = await publishContactCreate();

    expect(result.routineRuns).toBe(1);
  });

  it("still triggers once the routine's own execution context has ended", async () => {
    await runInRoutineContext({ causationDepth: 1 }, () => publishContactUpdate());
    const result = await publishContactUpdate();

    expect(result.routineRuns).toBe(1);
  });
});
