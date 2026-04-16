import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/constants/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { CreateServiceInteractor } from "../upsert/create-service.interactor";
import { UpdateServiceInteractor } from "../upsert/update-service.interactor";
import { DeleteServiceInteractor } from "../delete/delete-service.interactor";
import { CreateManyServicesInteractor } from "../upsert/create-many-services.interactor";
import { UpdateManyServicesInteractor } from "../upsert/update-many-services.interactor";
import { DeleteManyServicesInteractor } from "../delete/delete-many-services.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const SERVICE_ID = "00000000-0000-4000-8000-000000000001";
const SERVICE_ID_2 = "00000000-0000-4000-8000-000000000002";
const DEAL_ID_1 = "00000000-0000-4000-8000-000000000020";

function makeServiceDto(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE_ID,
    name: "Test Service",
    amount: 50,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    deals: [],
    users: [],
    customFieldValues: [],
    ...overrides,
  };
}

function makeDealDto(id: string) {
  return {
    id,
    name: `Deal ${id.slice(-2)}`,
    totalValue: 0,
    totalQuantity: 0,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    organizations: [],
    users: [],
    contacts: [],
    services: [],
    customFieldValues: [],
  };
}

describe("CreateServiceInteractor", () => {
  let mockCreateRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createServiceOrThrow: vi.fn().mockResolvedValue(makeServiceDto()),
    };
    mockDealRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new CreateServiceInteractor(mockCreateRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes SERVICE_CREATED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Service",
      amount: 50,
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.SERVICE_CREATED,
      expect.objectContaining({
        entityId: SERVICE_ID,
        payload: expect.objectContaining({ id: SERVICE_ID, name: "Test Service" }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after creation", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Service",
      amount: 50,
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("publishes DEAL_UPDATED events with payload for linked deals", async () => {
    const deal = makeDealDto(DEAL_ID_1);
    mockDealRepo.getManyOrThrowUnscoped.mockResolvedValue([deal]);

    const serviceWithDeals = makeServiceDto({
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });
    mockCreateRepo.createServiceOrThrow.mockResolvedValue(serviceWithDeals);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Service",
      amount: 50,
      userIds: [],
      dealIds: [DEAL_ID_1],
      customFieldValues: [],
    });

    const dealUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealUpdateCalls).toHaveLength(1);
    expect(dealUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("returns { ok: true, data: service } with the created service", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      name: "Test Service",
      amount: 50,
      userIds: [],
      dealIds: [],
      customFieldValues: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: SERVICE_ID,
        name: "Test Service",
        amount: 50,
      }),
    );
  });
});

describe("UpdateServiceInteractor", () => {
  let mockUpdateRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(makeServiceDto({ deals: [] })),
      updateServiceOrThrow: vi.fn().mockResolvedValue(makeServiceDto()),
    };
    mockDealRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateServiceInteractor(mockUpdateRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes SERVICE_UPDATED event with entityId and changes", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: SERVICE_ID,
      name: "Updated Service",
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.SERVICE_UPDATED,
      expect.objectContaining({
        entityId: SERVICE_ID,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after update", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: SERVICE_ID,
      name: "Updated Service",
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: service } with the updated service", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      id: SERVICE_ID,
      name: "Updated Service",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: SERVICE_ID,
        name: "Test Service",
      }),
    );
  });
});

describe("DeleteServiceInteractor", () => {
  let mockDeleteRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    const serviceDto = makeServiceDto({
      deals: [{ id: DEAL_ID_1, name: "Deal 20" }],
    });

    mockDeleteRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(serviceDto),
      deleteServiceOrThrow: vi.fn().mockResolvedValue(serviceDto),
    };
    mockDealRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeDealDto(DEAL_ID_1)]),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockWidgetService = {
      recalculateUserWidgets: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new DeleteServiceInteractor(mockDeleteRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes SERVICE_DELETED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: SERVICE_ID });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.SERVICE_DELETED,
      expect.objectContaining({
        entityId: SERVICE_ID,
        payload: expect.objectContaining({ id: SERVICE_ID }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload for deals linked to the deleted service", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: SERVICE_ID });

    const dealUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealUpdateCalls).toHaveLength(1);
    expect(dealUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after deletion", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: SERVICE_ID });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: id } with the deleted service id", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ id: SERVICE_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(SERVICE_ID);
  });
});

describe("CreateManyServicesInteractor", () => {
  let mockCreateRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const mockService1 = makeServiceDto();
  const mockService2 = makeServiceDto({ id: SERVICE_ID_2, name: "Service Two", amount: 100 });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createServiceOrThrow: vi.fn().mockResolvedValueOnce(mockService1).mockResolvedValueOnce(mockService2),
    };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new CreateManyServicesInteractor(mockCreateRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes SERVICE_CREATED events for each item created", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      services: [
        { name: "Service One", amount: 50, userIds: [], dealIds: [], customFieldValues: [] },
        { name: "Service Two", amount: 100, userIds: [], dealIds: [], customFieldValues: [] },
      ],
    });

    const createdCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_CREATED,
    );
    expect(createdCalls).toHaveLength(2);
    expect(createdCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID,
        payload: expect.objectContaining({ id: SERVICE_ID, name: "Test Service" }),
      }),
    );
    expect(createdCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_2,
        payload: expect.objectContaining({ id: SERVICE_ID_2, name: "Service Two" }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload for related deals", async () => {
    const deal = makeDealDto(DEAL_ID_1);
    mockDealRepo.getManyOrThrowUnscoped.mockResolvedValue([deal]);
    mockCreateRepo.createServiceOrThrow.mockReset();
    mockCreateRepo.createServiceOrThrow.mockResolvedValueOnce(
      makeServiceDto({ deals: [{ id: DEAL_ID_1, name: "Deal 20" }] }),
    );

    const interactor = createInteractor();
    await interactor.invoke({
      services: [{ name: "Service One", amount: 50, userIds: [], dealIds: [DEAL_ID_1], customFieldValues: [] }],
    });

    const dealCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealCalls).toHaveLength(1);
    expect(dealCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      services: [{ name: "Service One", amount: 50, userIds: [], dealIds: [], customFieldValues: [] }],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] } with array of created services", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      services: [
        { name: "Service One", amount: 50, userIds: [], dealIds: [], customFieldValues: [] },
        { name: "Service Two", amount: 100, userIds: [], dealIds: [], customFieldValues: [] },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(expect.objectContaining({ id: SERVICE_ID }));
    expect(result.data[1]).toEqual(expect.objectContaining({ id: SERVICE_ID_2 }));
  });
});

describe("UpdateManyServicesInteractor", () => {
  let mockUpdateRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const service1 = makeServiceDto();
  const service2 = makeServiceDto({ id: SERVICE_ID_2, name: "Service Two", amount: 100 });
  const updated1 = makeServiceDto({ name: "Updated One" });
  const updated2 = makeServiceDto({ id: SERVICE_ID_2, name: "Updated Two", amount: 100 });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([service1, service2]),
      updateServiceOrThrow: vi.fn().mockResolvedValueOnce(updated1).mockResolvedValueOnce(updated2),
    };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new UpdateManyServicesInteractor(mockUpdateRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes SERVICE_UPDATED events with payload for each item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      services: [
        { id: SERVICE_ID, name: "Updated One" },
        { id: SERVICE_ID_2, name: "Updated Two" },
      ],
    });

    const updatedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_UPDATED,
    );
    expect(updatedCalls).toHaveLength(2);
    expect(updatedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(updatedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_2,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID_2 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload when services have linked deals", async () => {
    const dealBefore = { ...makeDealDto(DEAL_ID_1), services: [] };
    const dealAfter = { ...makeDealDto(DEAL_ID_1), services: [{ id: SERVICE_ID }] };

    mockDealRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([dealBefore]).mockResolvedValueOnce([dealAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      services: [{ id: SERVICE_ID, name: "Updated One", dealIds: [DEAL_ID_1] }],
    });

    const dealCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealCalls).toHaveLength(1);
    expect(dealCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      services: [{ id: SERVICE_ID, name: "Updated One" }],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      services: [
        { id: SERVICE_ID, name: "Updated One" },
        { id: SERVICE_ID_2, name: "Updated Two" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe("DeleteManyServicesInteractor", () => {
  let mockDeleteRepo: any;
  let mockDealRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const service1 = makeServiceDto({ deals: [{ id: DEAL_ID_1, name: "Deal 20" }] });
  const service2 = makeServiceDto({ id: SERVICE_ID_2, name: "Service Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([service1, service2]),
      deleteServiceOrThrow: vi.fn().mockResolvedValueOnce(service1).mockResolvedValueOnce(service2),
    };
    mockDealRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeDealDto(DEAL_ID_1)]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new DeleteManyServicesInteractor(mockDeleteRepo, mockDealRepo, mockEventService, mockWidgetService);
  }

  it("publishes SERVICE_DELETED events with payload for each deleted item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [SERVICE_ID, SERVICE_ID_2] });

    const deletedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_DELETED,
    );
    expect(deletedCalls).toHaveLength(2);
    expect(deletedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID,
        payload: expect.objectContaining({ id: SERVICE_ID }),
      }),
    );
    expect(deletedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_2,
        payload: expect.objectContaining({ id: SERVICE_ID_2 }),
      }),
    );
  });

  it("publishes DEAL_UPDATED events with payload for related deals", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [SERVICE_ID, SERVICE_ID_2] });

    const dealCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(dealCalls).toHaveLength(1);
    expect(dealCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_1,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [SERVICE_ID, SERVICE_ID_2] });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...ids] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ ids: [SERVICE_ID, SERVICE_ID_2] });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([SERVICE_ID, SERVICE_ID_2]);
  });
});
