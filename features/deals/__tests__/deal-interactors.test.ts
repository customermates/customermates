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

import { CreateDealInteractor } from "../upsert/create-deal.interactor";
import { UpdateDealInteractor } from "../upsert/update-deal.interactor";
import { DeleteDealInteractor } from "../delete/delete-deal.interactor";
import { CreateManyDealsInteractor } from "../upsert/create-many-deals.interactor";
import { UpdateManyDealsInteractor } from "../upsert/update-many-deals.interactor";
import { DeleteManyDealsInteractor } from "../delete/delete-many-deals.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const DEAL_ID = "00000000-0000-4000-8000-000000000001";
const DEAL_ID_2 = "00000000-0000-4000-8000-000000000002";
const ORG_ID_1 = "00000000-0000-4000-8000-000000000010";
const CONTACT_ID_1 = "00000000-0000-4000-8000-000000000020";
const SERVICE_ID_1 = "00000000-0000-4000-8000-000000000030";

function makeDealDto(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    name: "Test Deal",
    totalValue: 100,
    totalQuantity: 1,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    organizations: [],
    users: [],
    tasks: [],
    contacts: [],
    services: [],
    customFieldValues: [],
    ...overrides,
  };
}

function makeOrgDto(id: string) {
  return { id, name: `Org ${id.slice(-2)}` };
}

function makeContactDto(id: string) {
  return {
    id,
    firstName: "Jane",
    lastName: "Doe",
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    organizations: [],
    users: [],
    tasks: [],
    deals: [],
    customFieldValues: [],
  };
}

function makeServiceDto(id: string) {
  return {
    id,
    name: `Service ${id.slice(-2)}`,
    amount: 50,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    deals: [],
    users: [],
    tasks: [],
    customFieldValues: [],
  };
}

describe("CreateDealInteractor", () => {
  let mockCreateRepo: any;
  let mockOrgRepo: any;
  let mockContactRepo: any;
  let mockServiceRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createDealOrThrow: vi.fn().mockResolvedValue(makeDealDto()),
    };
    mockOrgRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockContactRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockServiceRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]),
    };
    mockTaskRepo = {
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
    return new CreateDealInteractor(
      mockCreateRepo,
      mockOrgRepo,
      mockContactRepo,
      mockServiceRepo,
      mockTaskRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes DEAL_CREATED event with correct entityId and payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Deal",
      organizationIds: [],
      userIds: [],
      contactIds: [],
      services: [],
      taskIds: [],
      customFieldValues: [],
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.DEAL_CREATED,
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({ id: DEAL_ID, name: "Test Deal" }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets after creation", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Deal",
      organizationIds: [],
      userIds: [],
      contactIds: [],
      services: [],
      taskIds: [],
      customFieldValues: [],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("publishes ORGANIZATION_UPDATED events with payload for linked organizations", async () => {
    const org = makeOrgDto(ORG_ID_1);
    mockOrgRepo.getManyOrThrowUnscoped.mockResolvedValue([org]);

    const dealWithOrgs = makeDealDto({
      organizations: [org],
    });
    mockCreateRepo.createDealOrThrow.mockResolvedValue(dealWithOrgs);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Deal",
      organizationIds: [ORG_ID_1],
      userIds: [],
      contactIds: [],
      services: [],
      taskIds: [],
      customFieldValues: [],
    });

    const orgUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgUpdateCalls).toHaveLength(1);
    expect(orgUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes CONTACT_UPDATED events with payload for linked contacts", async () => {
    const contact = makeContactDto(CONTACT_ID_1);
    mockContactRepo.getManyOrThrowUnscoped.mockResolvedValue([contact]);

    const dealWithContacts = makeDealDto({
      contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }],
    });
    mockCreateRepo.createDealOrThrow.mockResolvedValue(dealWithContacts);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Deal",
      organizationIds: [],
      userIds: [],
      contactIds: [CONTACT_ID_1],
      services: [],
      taskIds: [],
      customFieldValues: [],
    });

    const contactUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    expect(contactUpdateCalls).toHaveLength(1);
    expect(contactUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes SERVICE_UPDATED events with payload for linked services", async () => {
    const service = makeServiceDto(SERVICE_ID_1);
    mockServiceRepo.getManyOrThrowUnscoped.mockResolvedValue([service]);

    const dealWithServices = makeDealDto({
      services: [{ id: SERVICE_ID_1, name: "Service 30", amount: 50, quantity: 2 }],
    });
    mockCreateRepo.createDealOrThrow.mockResolvedValue(dealWithServices);

    const interactor = createInteractor();
    await interactor.invoke({
      name: "Test Deal",
      organizationIds: [],
      userIds: [],
      contactIds: [],
      services: [{ serviceId: SERVICE_ID_1, quantity: 2 }],
      taskIds: [],
      customFieldValues: [],
    });

    const serviceUpdateCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_UPDATED,
    );
    expect(serviceUpdateCalls).toHaveLength(1);
    expect(serviceUpdateCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_1,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("returns { ok: true, data: deal } with the created deal", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      name: "Test Deal",
      organizationIds: [],
      userIds: [],
      contactIds: [],
      services: [],
      taskIds: [],
      customFieldValues: [],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: DEAL_ID,
        name: "Test Deal",
      }),
    );
  });
});

describe("UpdateDealInteractor", () => {
  let mockUpdateRepo: any;
  let mockOrgRepo: any;
  let mockContactRepo: any;
  let mockServiceRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const previousDeal = makeDealDto({
    organizations: [makeOrgDto(ORG_ID_1)],
    contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }],
    services: [{ id: SERVICE_ID_1, name: "Service 30", amount: 50, quantity: 1 }],
  });

  const updatedDeal = makeDealDto({
    name: "Updated Deal",
    organizations: [makeOrgDto(ORG_ID_1)],
    contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }],
    services: [{ id: SERVICE_ID_1, name: "Service 30", amount: 50, quantity: 2 }],
    updatedAt: new Date("2025-02-01"),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(previousDeal),
      updateDealOrThrow: vi.fn().mockResolvedValue(updatedDeal),
    };
    mockOrgRepo = {
      getManyOrThrowUnscoped: vi
        .fn()
        .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), deals: [] }])
        .mockResolvedValueOnce([{ ...makeOrgDto(ORG_ID_1), deals: [{ id: DEAL_ID }] }]),
    };
    mockContactRepo = {
      getManyOrThrowUnscoped: vi
        .fn()
        .mockResolvedValueOnce([{ ...makeContactDto(CONTACT_ID_1), deals: [] }])
        .mockResolvedValueOnce([{ ...makeContactDto(CONTACT_ID_1), deals: [{ id: DEAL_ID }] }]),
    };
    mockServiceRepo = {
      getManyOrThrowUnscoped: vi
        .fn()
        .mockResolvedValueOnce([{ ...makeServiceDto(SERVICE_ID_1), deals: [] }])
        .mockResolvedValueOnce([{ ...makeServiceDto(SERVICE_ID_1), deals: [{ id: DEAL_ID }] }]),
    };
    mockTaskRepo = {
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
    return new UpdateDealInteractor(
      mockUpdateRepo,
      mockOrgRepo,
      mockContactRepo,
      mockServiceRepo,
      mockTaskRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes DEAL_UPDATED event with changes", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: DEAL_ID,
      name: "Updated Deal",
      organizationIds: [ORG_ID_1],
      userIds: [],
      contactIds: [CONTACT_ID_1],
      services: [{ serviceId: SERVICE_ID_1, quantity: 2 }],
      taskIds: [],
      customFieldValues: [],
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.DEAL_UPDATED,
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID, name: "Updated Deal" }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes related entity update events with payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: DEAL_ID,
      name: "Updated Deal",
      organizationIds: [ORG_ID_1],
      userIds: [],
      contactIds: [CONTACT_ID_1],
      services: [{ serviceId: SERVICE_ID_1, quantity: 2 }],
      taskIds: [],
      customFieldValues: [],
    });

    const orgCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    const contactCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    const serviceCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_UPDATED,
    );

    expect(orgCalls.length).toBeGreaterThanOrEqual(1);
    expect(orgCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(contactCalls.length).toBeGreaterThanOrEqual(1);
    expect(contactCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(serviceCalls.length).toBeGreaterThanOrEqual(1);
    expect(serviceCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_1,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widget recalc", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      id: DEAL_ID,
      name: "Updated Deal",
      organizationIds: [],
      userIds: [],
      contactIds: [],
      services: [],
      taskIds: [],
      customFieldValues: [],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });
});

describe("DeleteDealInteractor", () => {
  let mockDeleteRepo: any;
  let mockOrgRepo: any;
  let mockContactRepo: any;
  let mockServiceRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const dealWithRelations = makeDealDto({
    organizations: [makeOrgDto(ORG_ID_1)],
    contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }],
    services: [{ id: SERVICE_ID_1, name: "Service 30", amount: 50, quantity: 1 }],
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getOrThrowUnscoped: vi.fn().mockResolvedValue(dealWithRelations),
      deleteDealOrThrow: vi.fn().mockResolvedValue(dealWithRelations),
    };
    mockOrgRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeOrgDto(ORG_ID_1)]),
    };
    mockContactRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeContactDto(CONTACT_ID_1)]),
    };
    mockServiceRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeServiceDto(SERVICE_ID_1)]),
    };
    mockTaskRepo = {
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
    return new DeleteDealInteractor(
      mockDeleteRepo,
      mockOrgRepo,
      mockContactRepo,
      mockServiceRepo,
      mockTaskRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes DEAL_DELETED event with payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: DEAL_ID });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.DEAL_DELETED,
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({ id: DEAL_ID }),
      }),
    );
  });

  it("publishes related entity update events with payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: DEAL_ID });

    const orgCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    const contactCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    const serviceCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_UPDATED,
    );

    expect(orgCalls).toHaveLength(1);
    expect(orgCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(contactCalls).toHaveLength(1);
    expect(contactCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(serviceCalls).toHaveLength(1);
    expect(serviceCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_1,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widget recalc", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ id: DEAL_ID });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: id }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ id: DEAL_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(DEAL_ID);
  });
});

describe("CreateManyDealsInteractor", () => {
  let mockCreateRepo: any;
  let mockOrgRepo: any;
  let mockContactRepo: any;
  let mockServiceRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const mockDeal1 = makeDealDto();
  const mockDeal2 = makeDealDto({ id: DEAL_ID_2, name: "Deal Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRepo = {
      createDealOrThrow: vi.fn().mockResolvedValueOnce(mockDeal1).mockResolvedValueOnce(mockDeal2),
    };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockTaskRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new CreateManyDealsInteractor(
      mockCreateRepo,
      mockOrgRepo,
      mockContactRepo,
      mockServiceRepo,
      mockTaskRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes DEAL_CREATED events for each item created", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      deals: [
        {
          name: "Deal One",
          organizationIds: [],
          userIds: [],
          contactIds: [],
          services: [],
          taskIds: [],
          customFieldValues: [],
        },
        {
          name: "Deal Two",
          organizationIds: [],
          userIds: [],
          contactIds: [],
          services: [],
          taskIds: [],
          customFieldValues: [],
        },
      ],
    });

    const createdCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_CREATED,
    );
    expect(createdCalls).toHaveLength(2);
    expect(createdCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({ id: DEAL_ID, name: "Test Deal" }),
      }),
    );
    expect(createdCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_2,
        payload: expect.objectContaining({ id: DEAL_ID_2, name: "Deal Two" }),
      }),
    );
  });

  it("publishes ORGANIZATION_UPDATED events with payload for related organizations", async () => {
    const org = makeOrgDto(ORG_ID_1);
    mockOrgRepo.getManyOrThrowUnscoped.mockResolvedValue([org]);
    mockCreateRepo.createDealOrThrow.mockReset();
    mockCreateRepo.createDealOrThrow.mockResolvedValueOnce(makeDealDto({ organizations: [org] }));

    const interactor = createInteractor();
    await interactor.invoke({
      deals: [
        {
          name: "Deal One",
          organizationIds: [ORG_ID_1],
          userIds: [],
          contactIds: [],
          services: [],
          taskIds: [],
          customFieldValues: [],
        },
      ],
    });

    const orgCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgCalls).toHaveLength(1);
    expect(orgCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      deals: [
        {
          name: "Deal One",
          organizationIds: [],
          userIds: [],
          contactIds: [],
          services: [],
          taskIds: [],
          customFieldValues: [],
        },
      ],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] } with array of created deals", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      deals: [
        {
          name: "Deal One",
          organizationIds: [],
          userIds: [],
          contactIds: [],
          services: [],
          taskIds: [],
          customFieldValues: [],
        },
        {
          name: "Deal Two",
          organizationIds: [],
          userIds: [],
          contactIds: [],
          services: [],
          taskIds: [],
          customFieldValues: [],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(expect.objectContaining({ id: DEAL_ID }));
    expect(result.data[1]).toEqual(expect.objectContaining({ id: DEAL_ID_2 }));
  });
});

describe("UpdateManyDealsInteractor", () => {
  let mockUpdateRepo: any;
  let mockOrgRepo: any;
  let mockContactRepo: any;
  let mockServiceRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const deal1 = makeDealDto();
  const deal2 = makeDealDto({ id: DEAL_ID_2, name: "Deal Two" });
  const updated1 = makeDealDto({ name: "Updated One" });
  const updated2 = makeDealDto({ id: DEAL_ID_2, name: "Updated Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([deal1, deal2]),
      updateDealOrThrow: vi.fn().mockResolvedValueOnce(updated1).mockResolvedValueOnce(updated2),
    };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockTaskRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new UpdateManyDealsInteractor(
      mockUpdateRepo,
      mockOrgRepo,
      mockContactRepo,
      mockServiceRepo,
      mockTaskRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes DEAL_UPDATED events with payload for each item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      deals: [
        { id: DEAL_ID, name: "Updated One" },
        { id: DEAL_ID_2, name: "Updated Two" },
      ],
    });

    const updatedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED,
    );
    expect(updatedCalls).toHaveLength(2);
    expect(updatedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(updatedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_2,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID_2 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes ORGANIZATION_UPDATED events with payload when deals have linked organizations", async () => {
    const orgBefore = { ...makeOrgDto(ORG_ID_1), deals: [] };
    const orgAfter = { ...makeOrgDto(ORG_ID_1), deals: [{ id: DEAL_ID }] };

    mockOrgRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([orgBefore]).mockResolvedValueOnce([orgAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      deals: [{ id: DEAL_ID, name: "Updated One", organizationIds: [ORG_ID_1] }],
    });

    const orgCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(orgCalls).toHaveLength(1);
    expect(orgCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes CONTACT_UPDATED events with payload when deals have linked contacts", async () => {
    const contactBefore = { ...makeContactDto(CONTACT_ID_1), deals: [] };
    const contactAfter = { ...makeContactDto(CONTACT_ID_1), deals: [{ id: DEAL_ID }] };

    mockContactRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([contactBefore]).mockResolvedValueOnce([contactAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      deals: [{ id: DEAL_ID, name: "Updated One", contactIds: [CONTACT_ID_1] }],
    });

    const contactCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    expect(contactCalls).toHaveLength(1);
    expect(contactCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("publishes SERVICE_UPDATED events with payload when deals have linked services", async () => {
    const serviceBefore = { ...makeServiceDto(SERVICE_ID_1), deals: [] };
    const serviceAfter = { ...makeServiceDto(SERVICE_ID_1), deals: [{ id: DEAL_ID }] };

    mockServiceRepo.getManyOrThrowUnscoped.mockResolvedValueOnce([serviceBefore]).mockResolvedValueOnce([serviceAfter]);

    const interactor = createInteractor();
    await interactor.invoke({
      deals: [{ id: DEAL_ID, name: "Updated One", services: [{ serviceId: SERVICE_ID_1, quantity: 1 }] }],
    });

    const serviceCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_UPDATED,
    );
    expect(serviceCalls).toHaveLength(1);
    expect(serviceCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_1,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      deals: [{ id: DEAL_ID, name: "Updated One" }],
    });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      deals: [
        { id: DEAL_ID, name: "Updated One" },
        { id: DEAL_ID_2, name: "Updated Two" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe("DeleteManyDealsInteractor", () => {
  let mockDeleteRepo: any;
  let mockOrgRepo: any;
  let mockContactRepo: any;
  let mockServiceRepo: any;
  let mockTaskRepo: any;
  let mockEventService: any;
  let mockWidgetService: any;

  const deal1 = makeDealDto({
    organizations: [makeOrgDto(ORG_ID_1)],
    contacts: [{ id: CONTACT_ID_1, firstName: "Jane", lastName: "Doe" }],
    services: [{ id: SERVICE_ID_1, name: "Service 30", amount: 50, quantity: 1 }],
  });
  const deal2 = makeDealDto({ id: DEAL_ID_2, name: "Deal Two" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeleteRepo = {
      getManyOrThrowUnscoped: vi.fn().mockResolvedValue([deal1, deal2]),
      deleteDealOrThrow: vi.fn().mockResolvedValueOnce(deal1).mockResolvedValueOnce(deal2),
    };
    mockOrgRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeOrgDto(ORG_ID_1)]) };
    mockContactRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeContactDto(CONTACT_ID_1)]) };
    mockServiceRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([makeServiceDto(SERVICE_ID_1)]) };
    mockTaskRepo = { getManyOrThrowUnscoped: vi.fn().mockResolvedValue([]) };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockWidgetService = { recalculateUserWidgets: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new DeleteManyDealsInteractor(
      mockDeleteRepo,
      mockOrgRepo,
      mockContactRepo,
      mockServiceRepo,
      mockTaskRepo,
      mockEventService,
      mockWidgetService,
    );
  }

  it("publishes DEAL_DELETED events with payload for each deleted item", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [DEAL_ID, DEAL_ID_2] });

    const deletedCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.DEAL_DELETED,
    );
    expect(deletedCalls).toHaveLength(2);
    expect(deletedCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({ id: DEAL_ID }),
      }),
    );
    expect(deletedCalls[1][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID_2,
        payload: expect.objectContaining({ id: DEAL_ID_2 }),
      }),
    );
  });

  it("publishes related entity UPDATED events with payload", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [DEAL_ID, DEAL_ID_2] });

    const orgCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    const contactCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.CONTACT_UPDATED,
    );
    const serviceCalls = mockEventService.publish.mock.calls.filter(
      ([event]: [DomainEvent]) => event === DomainEvent.SERVICE_UPDATED,
    );
    expect(orgCalls).toHaveLength(1);
    expect(orgCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: ORG_ID_1,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ id: ORG_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(contactCalls).toHaveLength(1);
    expect(contactCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: CONTACT_ID_1,
        payload: expect.objectContaining({
          contact: expect.objectContaining({ id: CONTACT_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
    expect(serviceCalls).toHaveLength(1);
    expect(serviceCalls[0][1]).toEqual(
      expect.objectContaining({
        entityId: SERVICE_ID_1,
        payload: expect.objectContaining({
          service: expect.objectContaining({ id: SERVICE_ID_1 }),
          changes: expect.any(Object),
        }),
      }),
    );
  });

  it("calls widgetService.recalculateUserWidgets", async () => {
    const interactor = createInteractor();
    await interactor.invoke({ ids: [DEAL_ID, DEAL_ID_2] });

    expect(mockWidgetService.recalculateUserWidgets).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data: [...ids] }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ ids: [DEAL_ID, DEAL_ID_2] });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([DEAL_ID, DEAL_ID_2]);
  });
});
